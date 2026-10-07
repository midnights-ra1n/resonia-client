export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  /** Lecture SYNCHRONE, réservée au démarrage (session, réglages, langue, cache des métadonnées) :
   *  l'interface peut ainsi s'afficher complète dès le tout premier rendu, sans écran de
   *  chargement intermédiaire. Ne jamais l'utiliser pour une donnée volumineuse. */
  getSync<T>(key: string): T | null;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}
