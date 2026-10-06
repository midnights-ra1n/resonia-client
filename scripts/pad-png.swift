// Centre une image PNG dans une toile carrée transparente plus grande (marges de la grille
// d'icônes macOS). Utilisé par scripts/build-mac-icns.sh.
// Usage : swift scripts/pad-png.swift <entrée.png> <sortie.png> <taille-toile-px>
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

let args = CommandLine.arguments
guard args.count == 4, let canvas = Int(args[3]),
      let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: args[1]) as CFURL, nil),
      let image = CGImageSourceCreateImageAtIndex(source, 0, nil),
      let context = CGContext(data: nil, width: canvas, height: canvas, bitsPerComponent: 8, bytesPerRow: 0,
                              space: CGColorSpace(name: CGColorSpace.sRGB)!,
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
else {
  FileHandle.standardError.write("Usage : pad-png.swift <entrée.png> <sortie.png> <taille-toile-px>\n".data(using: .utf8)!)
  exit(1)
}

context.interpolationQuality = .high
let x = (canvas - image.width) / 2
let y = (canvas - image.height) / 2
context.draw(image, in: CGRect(x: x, y: y, width: image.width, height: image.height))

guard let output = context.makeImage(),
      let destination = CGImageDestinationCreateWithURL(URL(fileURLWithPath: args[2]) as CFURL, UTType.png.identifier as CFString, 1, nil)
else { exit(1) }
CGImageDestinationAddImage(destination, output, nil)
exit(CGImageDestinationFinalize(destination) ? 0 : 1)
