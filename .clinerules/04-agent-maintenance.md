# Auto-maintenance de ces fichiers de contexte

## Règle pour l'agent

Après avoir corrigé un bug **non-trivial** (c'est-à-dire : la cause n'était pas évidente
à la lecture du code, ou la première tentative de correction était insuffisante/fausse),
ajoute une entrée dans `03-known-gotchas.md`, dans la section thématique appropriée
(ou crée-en une nouvelle si aucune ne convient), avec ce format :

```markdown
- **[symptôme observé]** — [cause réelle, en particulier si contre-intuitive].
  [Ce qu'il ne faut pas refaire / la bonne approche à suivre à la place].
```

Ne documente pas les corrections triviales (typo, import manquant, faute de frappe) —
seulement ce qui a nécessité une vraie investigation ou qui pourrait raisonnablement
être réintroduit par erreur plus tard.

## Règle pour les changements d'architecture

Si tu introduis un nouveau module, remplaces un fichier existant par une architecture
différente, ou changes une convention (ex: nouvelle librairie, nouveau pattern de
store), mets à jour la section correspondante dans `02-architecture.md` pour qu'elle
reflète l'état réel du code — un fichier de contexte obsolète est pire que pas de
fichier du tout, car il induit en erreur avec une fausse confiance.

## Ce qu'il ne faut jamais faire dans ces fichiers

- Ne pas y stocker de secrets, tokens, URLs de serveurs personnels, ou identifiants
- Ne pas y dupliquer le contenu complet de fichiers de code (résumer l'intention et les
  pièges, pas coller le code source)
- Ne pas supprimer une entrée de `03-known-gotchas.md` sans être certain à 100% que le
  piège n'existe plus dans l'architecture actuelle
