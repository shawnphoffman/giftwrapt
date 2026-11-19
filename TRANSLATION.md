# Translating GiftWrapt

This is the style guide for GiftWrapt's translations. It is the one reference for the web app
(`messages/`) and the iOS app's string catalogs. French is the first language; the rules that
are not specific to French apply to any language added later.

How the message files work (keys, plurals, markup) is in [messages/README.md](messages/README.md).
This file is about what the words should be.

## Fixing a translation

The catalogs are plain JSON, one file per area: `messages/fr/<area>.json`. To fix a string,
edit its value and open a pull request. Keep the key, the `{placeholders}` and any
`{#tags}...{/tags}` exactly as they are in the English file `messages/en/<area>.json`.

The translations were written and reviewed by AI sessions against this guide, not by a native
speaker. Corrections from people who speak the language are welcome and are the most useful
contribution this project can get.

## Voice

- Address the reader as **vous**. Never "tu".
- Warm and plain, like a helpful person, not a manual. Short sentences. No exclamation marks
  unless the English has one.
- GiftWrapt is about giving to people you know. Prefer everyday words ("offrir", "cadeau",
  "proches") to commercial ones ("acheter", "produit", "clients").
- Do not translate word for word. Say what a French speaker would say in that spot. A button
  is a verb in the infinitive ("Enregistrer", "Ajouter un article"); a title is a noun phrase.
- **Sentence case** for titles, buttons and labels, even where English uses Title Case:
  "Paramètres du compte", not "Paramètres Du Compte". Proper nouns keep their capital.
- Inclusive without being heavy: prefer a neutral wording ("la personne qui offre", "vos
  proches") to doubled forms or the median point. Never guess the gender of a named person.

## Names and agreement

A message often contains someone's name, and the app does not know their gender.

- No adjective or past participle may agree with an interpolated name. Not
  "{name} est connecté(e)"; write "{name} a ouvert une session" or "Session ouverte par {name}".
- Possessives go after the noun: "{name}'s list" is "la liste de {name}". "de {name}" stays
  as is before a vowel; do not try to elide it.
- A list name, item title or holiday name typed by a person is quoted with guillemets when it
  sits inside a sentence: "Ajouté à « {listName} »". Never give it an article ("le {listName}").
- An occasion name stands alone rather than mid-sentence: "{holiday} : plus que {count} jours",
  not "{holiday} est dans {count} jours" (the verb would have to agree).

## Plurals and numbers

- French treats 0 and 1 as singular: "0 article", "1 article", "2 articles". The `one` branch
  of a plural message covers both.
- Every plural message ends with the catch-all `*` branch.
- Numbers, dates and amounts are formatted by the app. Do not write separators or currency
  symbols into a message; use the placeholder.

## Typography

- Apostrophe: the curly one, `’` (U+2019). Never the straight `'`.
- A narrow no-break space (U+202F) before `;` `!` `?`, and a no-break space (U+00A0) before `:`.
- Guillemets with no-break spaces inside: `« texte »`. Not "English quotes".
- Ellipsis is one character: `…`.
- "e-mail", with the hyphen. "Wi-Fi". Capitals keep their accents: "À propos", "État".

## Glossary

Use these every time. If a term is missing, look at how the same English word was translated
elsewhere in `messages/fr` before choosing a new one, then add it here.

| English                           | French                                           | Notes                                                                            |
| --------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------- |
| item                              | article                                          | An entry on a list. Not "objet", not "élément", not "produit".                   |
| list                              | liste                                            |                                                                                  |
| wishlist                          | liste de souhaits                                |                                                                                  |
| gift                              | cadeau                                           |                                                                                  |
| gift ideas (list type)            | idées cadeaux                                    | Private notes about what to give someone.                                        |
| to claim / claimed                | réserver / réservé                               | Saying "I will give this". Never "réclamer" or "revendiquer".                    |
| claim (noun)                      | réservation                                      |                                                                                  |
| gifter                            | donateur, or "la personne qui offre"             | "vos proches" when it means the people shopping for you.                         |
| co-gifter                         | co-donateur                                      | Someone giving the same gift together with you.                                  |
| gift credit                       | crédit du cadeau                                 | Who is shown as having given a gift.                                             |
| recipient                         | destinataire                                     | The person a list or gift is for.                                                |
| reveal / revealed                 | révélation / révélé                              | The moment a recipient learns who gave what.                                     |
| off-list gift                     | cadeau hors liste                                | A gift that was not an item on the list.                                         |
| primary list                      | liste principale                                 |                                                                                  |
| archive / archived                | archiver / archivé                               |                                                                                  |
| purchase                          | achat                                            |                                                                                  |
| received gifts                    | cadeaux reçus                                    |                                                                                  |
| partner                           | partenaire                                       | The person an account is paired with. Not "conjoint".                            |
| dependent                         | personne à charge                                | Someone (a child, a pet) whose lists a guardian manages.                         |
| guardian                          | tuteur                                           | The account that manages a dependent or a child account.                         |
| child account                     | compte enfant                                    |                                                                                  |
| suggestions                       | suggestions                                      | The app's recommendations about your lists.                                      |
| to dismiss                        | ignorer                                          |                                                                                  |
| to skip (a step, a suggestion)    | passer                                           |                                                                                  |
| skipped (status of a job or run)  | ignoré                                           | "omis" on the admin suggestions screens, where "ignoré" already means dismissed. |
| to acknowledge (an alert)         | prendre acte                                     |                                                                                  |
| editor (of a list)                | éditeur                                          | Next to a name, write "fait partie des éditeurs" so nothing agrees with it.      |
| pick-one group / in-order group   | groupe « un au choix » / groupe « dans l'ordre » |                                                                                  |
| to extend the reveal              | reporter la révélation                           | Not "prolonger".                                                                 |
| to-do / to-do list                | tâche / liste de tâches                          |                                                                                  |
| holiday                           | fête                                             | "fête personnalisée" for one an admin created.                                   |
| digest (email)                    | récapitulatif                                    |                                                                                  |
| run (of a job)                    | exécution                                        | "analyse" on the suggestions screens people see.                                 |
| provider                          | fournisseur                                      |                                                                                  |
| endpoint                          | point d'accès                                    |                                                                                  |
| deployment / instance             | déploiement                                      |                                                                                  |
| backup code                       | code de secours                                  |                                                                                  |
| attachment / receipt              | pièce jointe / reçu                              |                                                                                  |
| to impersonate                    | prendre l'identité                               | Noun: "prise d'identité".                                                        |
| orphaned / attached (stored file) | orphelin / rattaché                              |                                                                                  |
| settings                          | paramètres                                       | Not "réglages".                                                                  |
| sign in / sign out                | se connecter / se déconnecter                    | Noun: "connexion".                                                               |
| sign up                           | créer un compte                                  |                                                                                  |
| password                          | mot de passe                                     |                                                                                  |
| passkey                           | clé d'accès                                      |                                                                                  |
| two-factor authentication         | authentification à deux facteurs                 |                                                                                  |
| email                             | e-mail                                           |                                                                                  |
| to upload                         | importer                                         | A file or photo going from the device to the app.                                |
| link, URL (what a person pastes)  | lien                                             | "URL" only on admin screens.                                                     |
| priority                          | priorité                                         |                                                                                  |
| notes                             | notes                                            |                                                                                  |
| price                             | prix                                             |                                                                                  |
| birthday                          | anniversaire                                     | A couple's "anniversary" is "anniversaire de couple".                            |
| Christmas                         | Noël                                             | No article: "pour Noël".                                                         |
| Mother's Day / Father's Day       | fête des Mères / fête des Pères                  |                                                                                  |
| Valentine's Day                   | Saint-Valentin                                   | With the article in a sentence: "la Saint-Valentin".                             |
| admin                             | administrateur                                   | The role. The screen area is "Administration".                                   |
| scraper / scraping (admin)        | extracteur / extraction                          | Reading a product page from its link.                                            |
| token (AI usage)                  | token                                            | "jeton" only for an access or API token.                                         |

## Do not translate

- **GiftWrapt**, and names of other products and services (Resend, OpenAI, Anthropic, S3,
  Sentry, Home Assistant).
- Anything a person typed: names, list names, item titles and notes, custom holiday titles,
  the instance's own title.
- Technical words an administrator types or reads elsewhere as they are: API, OIDC, MCP, cron,
  webhook, URL, JSON, bucket, environment variable names, paths such as `/admin`.
- Placeholders and tags: `{name}`, `{count}`, `{#link}...{/link}` stay byte for byte. Tags may
  move within the sentence so the French reads naturally.

## Checking a translation

Read the French on its own, without the English, and ask:

1. Would a French speaker say this, here, to someone they know?
2. Is it "vous" throughout?
3. Does anything agree in gender or number with a name the app filled in?
4. Are the glossary terms used as written?
5. Do 0, 1 and 2 each read correctly in the plural messages?
6. Are all placeholders and tags present, and no others?
7. Will it fit? A button or badge much longer than the English is a layout risk; find a
   shorter wording before accepting a clipped one.
