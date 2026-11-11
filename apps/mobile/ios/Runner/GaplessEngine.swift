import AVFoundation
import AudioToolbox

struct EngineTrack {
  let id: String
  let path: String  // fichier de cache COMPLET
}

/// Moteur audio iOS (AVAudioEngine), calqué sur celui du bureau (gaplessEngine.ts) :
///
/// - les pistes sont décodées par morceaux de 4 s, EN SÉQUENCE depuis le début du fichier (jamais de
///   saut dans le fichier compressé), puis planifiées bord à bord dans un seul `AVAudioPlayerNode` :
///   le raccord entre deux pistes est une simple suite de tampons, à l'échantillon près ;
/// - le décodage est toujours ~10 s en avance sur la lecture, la piste suivante commence donc à être
///   planifiée avant la fin de la courante, sans dépendre du réseau (fichiers déjà en cache) ;
/// - vitesse et hauteur se règlent en direct sur les unités `Varispeed` / `TimePitch` : aucun
///   tampon n'est jeté, aucune coupure quand on déplace le pitch ;
/// - le silence de bord est rogné comme dans silenceTrim.ts.
///
/// File d'attente, mélange, boucle et téléchargements sont gérés côté Dart : ce moteur ne reçoit que
/// la piste courante et les suivantes déjà prêtes ([setNext]).
final class GaplessEngine {
  private static let silenceThreshold: Float = 0.0012
  private static let maxTrimSeconds = 0.3
  private static let firstChunkSeconds = 1.0
  private static let chunkSeconds = 4.0
  private static let aheadSeconds = 10.0
  /// La dernière tranche d'une piste fait au moins ceci : de quoi rogner son silence final.
  private static let tailMarginSeconds = 0.35

  var onStarted: ((String, Double) -> Void)?  // (id, durée en s)
  var onEnded: (() -> Void)?  // plus rien à jouer
  var onPlaying: ((Bool, Double) -> Void)?  // (lecture, position) : interruption, casque débranché
  var onError: ((String) -> Void)?

  private let engine = AVAudioEngine()
  private let node = AVAudioPlayerNode()
  private let timePitch = AVAudioUnitTimePitch()
  private let varispeed = AVAudioUnitVarispeed()
  private let q = DispatchQueue(label: "resonia.engine")
  private let decodeQ = DispatchQueue(label: "resonia.engine.decode", qos: .userInitiated)

  private var outFormat = AVAudioFormat(standardFormatWithSampleRate: 44_100, channels: 2)!
  private var gen = 0  // change à chaque reconstruction : les rappels périmés sont ignorés

  private final class Cursor {
    let id: String
    let file: AVAudioFile
    let converter: AVAudioConverter?
    let rate: Double  // fréquence du fichier
    var skip: Int64  // images d'amorce de l'encodeur à lire et jeter
    var pos: Int64  // prochaine image à lire
    let end: Int64  // fin utile (reste de l'encodeur exclu)
    var fresh: Bool  // début de piste : silence initial à rogner
    init(id: String, file: AVAudioFile, converter: AVAudioConverter?, skip: Int64, pos: Int64, end: Int64, fresh: Bool) {
      self.id = id; self.file = file; self.converter = converter; self.rate = file.processingFormat.sampleRate
      self.skip = skip; self.pos = pos; self.end = end; self.fresh = fresh
    }
  }

  private struct Playing {
    let id: String
    let startsAt: Int64  // `scheduled` au moment où la piste commence
    let offset: Double  // position (s) de la première image
    let duration: Double
  }

  // État, uniquement sur `q`.
  private var playing = false
  private var speed = 1.0
  private var coupled = true
  private var tracks: [Playing] = []  // [0] sonne ; les suivantes sont déjà (en partie) planifiées
  private var nextQueue: [EngineTrack] = []  // à venir, pas encore ouvertes
  private var frontier: Cursor?
  private var decoding = false
  private var scheduled: Int64 = 0
  private var completed: Int64 = 0
  private var pending: [Int64] = []  // taille des tampons planifiés, du plus ancien au plus récent
  private var anchorTime = 0.0
  private var anchorFrames = 0.0  // images écoulées dans le tampon en cours, à anchorTime
  private var lastPosition = 0.0

  init() {
    engine.attach(node)
    engine.attach(timePitch)
    engine.attach(varispeed)
    connect()
    applyRate()
    let nc = NotificationCenter.default
    nc.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: nil) { [weak self] n in
      let info = n.userInfo
      let type = (info?[AVAudioSessionInterruptionTypeKey] as? UInt).flatMap(AVAudioSession.InterruptionType.init)
      let opts = AVAudioSession.InterruptionOptions(rawValue: info?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0)
      self?.q.async {
        if type == .began { self?.pauseNow() } else if type == .ended, opts.contains(.shouldResume) { self?.playNow() }
      }
    }
    nc.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: nil) { [weak self] n in
      let reason = (n.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt).flatMap(AVAudioSession.RouteChangeReason.init)
      if reason == .oldDeviceUnavailable { self?.q.async { self?.pauseNow() } }
    }
    nc.addObserver(forName: .AVAudioEngineConfigurationChange, object: engine, queue: nil) { [weak self] _ in
      self?.q.async { self?.recoverEngine() }
    }
  }

  private func connect() {
    engine.disconnectNodeOutput(node)
    engine.disconnectNodeOutput(timePitch)
    engine.disconnectNodeOutput(varispeed)
    engine.connect(node, to: timePitch, format: outFormat)
    engine.connect(timePitch, to: varispeed, format: outFormat)
    engine.connect(varispeed, to: engine.mainMixerNode, format: outFormat)
  }

  // MARK: commandes (appelées depuis le thread principal)

  /// Remplace tout : [tracks][0] est la piste courante, le reste est la suite déjà prête.
  func start(_ list: [EngineTrack], position: Double, play: Bool, done: @escaping (Bool) -> Void) {
    q.async { [self] in
      done(begin(list, position: position, play: play))
    }
  }

  /// Pistes à venir (après la courante), déjà entièrement en cache, dans l'ordre de lecture.
  func setNext(_ list: [EngineTrack]) {
    q.async { [self] in
      let committed = tracks.dropFirst().count
      let upcoming = Array(tracks.dropFirst())
      // Les pistes déjà planifiées dans le nœud ne peuvent plus changer sans reconstruire.
      if list.count >= committed, zip(upcoming, list).allSatisfy({ $0.id == $1.id }) {
        nextQueue = Array(list.dropFirst(committed))
        pump()
      } else if let cur = currentTrack() {
        begin([cur] + list, position: positionNow(), play: playing, started: false)
      } else {
        nextQueue = list
      }
    }
  }

  func play() { q.async { [self] in playNow() } }

  /// Renvoie la position (s) à laquelle la lecture s'est arrêtée.
  func pause(done: @escaping (Double) -> Void) {
    q.async { [self] in
      pauseNow()
      done(lastPosition)
    }
  }

  func seek(_ seconds: Double, done: @escaping () -> Void) {
    q.async { [self] in
      if let t = tracks.first, let cur = currentTrack() {
        let to = max(0, min(seconds, max(0, t.duration - 0.5)))
        begin([cur] + nextQueueAll(), position: to, play: playing, started: false)
      }
      done()
    }
  }

  func stop() {
    q.async { [self] in
      gen += 1
      node.stop()
      playing = false
      tracks = []; nextQueue = []; frontier = nil; decoding = false
      scheduled = 0; completed = 0; pending = []
    }
  }

  /// Vitesse (1 = normale). [coupled] : la hauteur suit la vitesse (platine) ; sinon elle est conservée.
  func setRate(_ speed: Double, coupled: Bool) {
    q.async { [self] in
      anchorFrames = framesNow()
      anchorTime = ProcessInfo.processInfo.systemUptime
      self.speed = speed
      self.coupled = coupled
      applyRate()
    }
  }

  func position(done: @escaping (Double) -> Void) {
    q.async { [self] in done(positionNow()) }
  }

  // MARK: sur `q`

  private var currentTrackPath: [String: String] = [:]

  private func currentTrack() -> EngineTrack? {
    guard let id = tracks.first?.id, let p = currentTrackPath[id] else { return nil }
    return EngineTrack(id: id, path: p)
  }

  private func nextQueueAll() -> [EngineTrack] {
    tracks.dropFirst().compactMap { t in currentTrackPath[t.id].map { EngineTrack(id: t.id, path: $0) } } + nextQueue
  }

  private func applyRate() {
    // Varispeed reste actif en permanence (rééchantillonneur bon marché) : on ne bascule jamais son
    // contournement pendant qu'on glisse le fader. TimePitch ne tourne qu'en Master Tempo.
    varispeed.rate = coupled ? Float(speed) : 1
    timePitch.bypass = coupled
    timePitch.rate = Float(coupled ? 1 : speed)
    timePitch.pitch = 0
  }

  private func now() -> Double { ProcessInfo.processInfo.systemUptime }

  /// Images écoulées dans le tampon en cours : horloge murale × vitesse, bornée par sa taille
  /// (recalée à chaque fin de tampon).
  private func framesNow() -> Double {
    guard let size = pending.first else { return 0 }
    let extra = playing ? (now() - anchorTime) * speed * outFormat.sampleRate : 0
    return min(Double(size), anchorFrames + extra)
  }

  private func positionNow() -> Double {
    guard let t = tracks.first else { return lastPosition }
    let p = t.offset + (Double(completed - t.startsAt) + framesNow()) / outFormat.sampleRate
    lastPosition = max(0, p)
    return lastPosition
  }

  private func activateSession() throws {
    let s = AVAudioSession.sharedInstance()
    try s.setCategory(.playback, mode: .default)
    try s.setActive(true)
  }

  private func ensureRunning() throws {
    try activateSession()
    if !engine.isRunning { try engine.start() }
  }

  private func playNow() {
    guard !playing || !node.isPlaying else { return }
    do { try ensureRunning() } catch {
      if let id = tracks.first?.id { onError?(id) }
      return
    }
    anchorTime = now()
    playing = true
    node.play()
    onPlaying?(true, positionNow())
  }

  private func pauseNow() {
    guard playing else { return }
    anchorFrames = framesNow()
    anchorTime = now()
    playing = false
    node.pause()
    lastPosition = positionNow()
    onPlaying?(false, lastPosition)
  }

  /// Le matériel a changé (casque, rappel) : le moteur s'est arrêté, on repart de la position.
  private func recoverEngine() {
    guard !tracks.isEmpty, !engine.isRunning else { return }
    if let cur = currentTrack() { begin([cur] + nextQueueAll(), position: positionNow(), play: playing, started: false) }
  }

  @discardableResult
  private func begin(_ list: [EngineTrack], position: Double, play: Bool, started: Bool = true) -> Bool {
    guard let first = list.first else { return false }
    gen += 1
    node.stop()
    frontier = nil; decoding = false; tracks = []
    scheduled = 0; completed = 0; pending = []
    anchorFrames = 0
    lastPosition = position
    for t in list { currentTrackPath[t.id] = t.path }
    guard let f = try? AVAudioFile(forReading: URL(fileURLWithPath: first.path)) else {
      onError?(first.id)
      return false
    }
    let rate = f.processingFormat.sampleRate
    if rate != outFormat.sampleRate {
      engine.stop()
      outFormat = AVAudioFormat(standardFormatWithSampleRate: rate, channels: 2)!
      connect()
    }
    nextQueue = Array(list.dropFirst())
    guard let c = open(first, from: position) else {
      onError?(first.id)
      return false
    }
    frontier = c
    tracks = [Playing(id: first.id, startsAt: 0, offset: position, duration: Self.duration(of: first.path))]
    playing = false
    // Premier tampon décodé tout de suite : la lecture part sans attendre le reste.
    guard let chunk = Self.read(c, seconds: Self.firstChunkSeconds, out: outFormat) else {
      onError?(first.id)
      return false
    }
    if play { do { try ensureRunning() } catch { onError?(first.id); return false } }
    schedule(chunk.buffer, last: chunk.last, c)
    if play {
      anchorTime = now()
      playing = true
      node.play()
    }
    if started { onStarted?(first.id, tracks[0].duration) }
    pump()
    return true
  }

  /// Ouvre une piste : amorce / reste de l'encodeur lus dans le fichier, position de départ.
  private func open(_ t: EngineTrack, from seconds: Double) -> Cursor? {
    guard let f = try? AVAudioFile(forReading: URL(fileURLWithPath: t.path)), f.length > 0 else { return nil }
    var pre: Int64 = 0, post: Int64 = 0
    if let i = Self.packetInfo(t.path), f.length == i.mNumberValidFrames + Int64(i.mPrimingFrames) + Int64(i.mRemainderFrames) {
      pre = Int64(i.mPrimingFrames)
      post = Int64(i.mRemainderFrames)
    }
    let converter = f.processingFormat == outFormat ? nil : AVAudioConverter(from: f.processingFormat, to: outFormat)
    if f.processingFormat != outFormat, converter == nil { return nil }
    let end = f.length - post
    if seconds > 0 {
      let at = min(end - 1, pre + Int64(seconds * f.processingFormat.sampleRate))
      f.framePosition = at
      return Cursor(id: t.id, file: f, converter: converter, skip: 0, pos: at, end: end, fresh: false)
    }
    return Cursor(id: t.id, file: f, converter: converter, skip: pre, pos: pre, end: end, fresh: true)
  }

  private static func duration(of path: String) -> Double {
    guard let f = try? AVAudioFile(forReading: URL(fileURLWithPath: path)) else { return 0 }
    var pre: Int64 = 0, post: Int64 = 0
    if let i = packetInfo(path), f.length == i.mNumberValidFrames + Int64(i.mPrimingFrames) + Int64(i.mRemainderFrames) {
      pre = Int64(i.mPrimingFrames); post = Int64(i.mRemainderFrames)
    }
    return Double(f.length - pre - post) / f.processingFormat.sampleRate
  }

  /// Garde ~10 s décodées en avance : tranche suivante de la piste courante, ou début de la suivante.
  private func pump() {
    guard !decoding, !tracks.isEmpty else { return }
    guard Double(scheduled - completed) / outFormat.sampleRate < Self.aheadSeconds else { return }
    if frontier == nil {
      guard let t = nextQueue.first else { return }
      nextQueue.removeFirst()
      guard let c = open(t, from: 0) else {
        onError?(t.id)
        return pump()
      }
      frontier = c
      currentTrackPath[t.id] = t.path
      tracks.append(Playing(id: t.id, startsAt: scheduled, offset: 0, duration: Self.duration(of: t.path)))
    }
    guard let c = frontier else { return }
    decoding = true
    let g = gen, out = outFormat
    decodeQ.async { [weak self] in
      let chunk = Self.read(c, seconds: Self.chunkSeconds, out: out)
      self?.q.async {
        guard let self, g == self.gen else { return }
        self.decoding = false
        if let chunk {
          self.schedule(chunk.buffer, last: chunk.last, c)
        } else {
          // Fichier tronqué : la piste s'arrête là.
          self.frontier = nil
          self.markEnd(c.id, g)
        }
        self.pump()
      }
    }
  }

  private func schedule(_ buffer: AVAudioPCMBuffer, last: Bool, _ c: Cursor) {
    let n = Int64(buffer.frameLength)
    scheduled += n
    pending.append(n)
    if last { frontier = nil }
    let g = gen
    node.scheduleBuffer(buffer, completionCallbackType: .dataPlayedBack) { [weak self] _ in
      self?.q.async {
        guard let self, g == self.gen else { return }
        self.finished(n, last: last)
      }
    }
  }

  /// Un tampon vient d'être entièrement joué.
  private func finished(_ n: Int64, last: Bool) {
    completed += n
    if !pending.isEmpty { pending.removeFirst() }
    anchorFrames = 0
    anchorTime = now()
    if last, !tracks.isEmpty {
      tracks.removeFirst()
      if let next = tracks.first {
        lastPosition = 0
        onStarted?(next.id, next.duration)
      } else if frontier == nil, nextQueue.isEmpty {
        playing = false
        onEnded?()
        return
      }
    }
    pump()
  }

  private func markEnd(_ id: String, _ g: Int) {
    // Piste dont plus aucun tampon ne viendra : on simule la fin avec un tampon vide.
    guard let b = AVAudioPCMBuffer(pcmFormat: outFormat, frameCapacity: 1) else { return }
    b.frameLength = 1
    for c in 0..<Int(outFormat.channelCount) { b.floatChannelData![c][0] = 0 }
    scheduled += 1
    pending.append(1)
    node.scheduleBuffer(b, completionCallbackType: .dataPlayedBack) { [weak self] _ in
      self?.q.async {
        guard let self, g == self.gen else { return }
        self.finished(1, last: true)
      }
    }
  }

  // MARK: décodage (decodeQ)

  /// Prochaine tranche d'environ [seconds] de la piste, rognée aux bords si c'est la première / la
  /// dernière. `last` : fin de la piste. nil : rien à lire.
  private static func read(_ c: Cursor, seconds: Double, out: AVAudioFormat) -> (buffer: AVAudioPCMBuffer, last: Bool)? {
    let src = c.file.processingFormat
    while c.skip > 0 {
      let n = min(c.skip, 65_536)
      guard let junk = AVAudioPCMBuffer(pcmFormat: src, frameCapacity: AVAudioFrameCount(n)),
        (try? c.file.read(into: junk, frameCount: AVAudioFrameCount(n))) != nil, junk.frameLength > 0
      else { break }
      c.skip -= Int64(junk.frameLength)
    }
    c.skip = 0
    let remaining = c.end - c.pos
    guard remaining > 0 else { return nil }
    var want = Int64(seconds * c.rate)
    if remaining - want < Int64(tailMarginSeconds * c.rate) { want = remaining }
    guard let raw = AVAudioPCMBuffer(pcmFormat: src, frameCapacity: AVAudioFrameCount(want)) else { return nil }
    do { try c.file.read(into: raw, frameCount: AVAudioFrameCount(want)) } catch {
      if raw.frameLength == 0 { return nil }
    }
    guard raw.frameLength > 0 else { return nil }
    c.pos += Int64(raw.frameLength)
    let last = c.pos >= c.end || Int64(raw.frameLength) < want

    var buf = raw
    if let conv = c.converter {
      let cap = AVAudioFrameCount(Double(raw.frameLength) * out.sampleRate / src.sampleRate) + 64
      guard let o = AVAudioPCMBuffer(pcmFormat: out, frameCapacity: cap) else { return nil }
      var given = false
      var err: NSError?
      conv.convert(to: o, error: &err) { _, status in
        if given { status.pointee = .noDataNow; return nil }
        given = true
        status.pointee = .haveData
        return raw
      }
      guard err == nil, o.frameLength > 0 else { return nil }
      buf = o
    }
    if c.fresh || last { trim(buf, head: c.fresh, tail: last) }
    c.fresh = false
    return (buf, last)
  }

  /// Silence de bord (≤ 0,3 s, canal 0) puis creux de bord de l'encodeur : voir [dropoutTrim].
  private static func trim(_ b: AVAudioPCMBuffer, head: Bool, tail: Bool) {
    guard let chs = b.floatChannelData else { return }
    let ch = chs[0]
    let rate = b.format.sampleRate
    let len = Int(b.frameLength)
    let maxTrim = Int(maxTrimSeconds * rate)
    var start = 0
    var end = len
    if head { while start < min(maxTrim, end - 1), abs(ch[start]) <= silenceThreshold { start += 1 } }
    if tail { while len - end < min(maxTrim, end - start - 1), abs(ch[end - 1]) <= silenceThreshold { end -= 1 } }
    dropoutTrim(ch, &start, &end, rate: rate, head: head, tail: tail)
    guard start > 0 || end < len else { return }
    let n = end - start
    for c in 0..<Int(b.format.channelCount) where start > 0 {
      memmove(chs[c], chs[c] + start, n * MemoryLayout<Float>.size)
    }
    b.frameLength = AVAudioFrameCount(n)
  }

  /// Creux de bord : la première / dernière fenêtre d'un fichier AAC encodé seul est souvent mal
  /// reconstruite (pas de fenêtre voisine pour le recouvrement) et retombe de 20-30 dB sur quelques
  /// ms, ce qui s'entend comme une micro-coupure au raccord. Les fenêtres de 3 ms (assez longues
  /// pour ne pas prendre le passage par zéro d'une basse pour un creux) qui restent sous 1/32
  /// (-15 dB) de la puissance de la musique voisine sont retirées, 21 ms au plus. Même réglage que
  /// silenceTrim.ts (bureau), et même test.
  /// shortcut: heuristique sur le canal 0 ; à affiner si un vrai pianissimo de bord était rogné.
  private static func dropoutTrim(_ ch: UnsafeMutablePointer<Float>, _ start: inout Int, _ end: inout Int, rate: Double, head: Bool, tail: Bool) {
    let w = max(1, Int(rate * 0.003))
    let maxCut = 7 * w
    let ref = Int(rate * 0.045)
    guard end - start > 2 * (maxCut + ref) else { return }
    func level(_ from: Int, _ count: Int) -> Float {
      var e: Float = 0
      for i in from..<(from + count) { e += ch[i] * ch[i] }
      return e / Float(count)
    }
    if tail {
      let limit = level(end - maxCut - ref, ref) / 32
      var cut = 0
      while cut < maxCut, level(end - cut - w, w) < limit { cut += w }
      end -= cut
    }
    if head {
      let limit = level(start + maxCut, ref) / 32
      var cut = 0
      while cut < maxCut, level(start + cut, w) < limit { cut += w }
      start += cut
    }
  }

  /// Amorce et reste d'encodage inscrits dans le fichier (nil : aucune info).
  private static func packetInfo(_ path: String) -> AudioFilePacketTableInfo? {
    var id: AudioFileID?
    guard AudioFileOpenURL(URL(fileURLWithPath: path) as CFURL, .readPermission, 0, &id) == noErr, let id else { return nil }
    defer { AudioFileClose(id) }
    var info = AudioFilePacketTableInfo()
    var size = UInt32(MemoryLayout<AudioFilePacketTableInfo>.size)
    guard AudioFileGetProperty(id, kAudioFilePropertyPacketTableInfo, &size, &info) == noErr else { return nil }
    return info
  }
}
