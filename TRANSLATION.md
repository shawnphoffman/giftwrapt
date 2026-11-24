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
  not "{holiday} est dans {count} jours" (the verb would have to agree). Email subjects use one
  form for every occasion: "{holiday} dans {count} jours", and "{holiday}, c’est demain" for one
  day.

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

| English                           | French                                           | Notes                                                                                                                                                                                      |
| --------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| item                              | article                                          | An entry on a list. Not "objet", not "élément", not "produit".                                                                                                                             |
| list                              | liste                                            |                                                                                                                                                                                            |
| wishlist                          | liste de souhaits                                | Amazon's own list is "liste d'envies", the name Amazon.fr uses.                                                                                                                            |
| gift                              | cadeau                                           |                                                                                                                                                                                            |
| gift ideas (list type)            | idées cadeaux                                    | Private notes about what to give someone.                                                                                                                                                  |
| to claim / claimed                | réserver / réservé                               | Saying "I will give this". Never "réclamer" or "revendiquer".                                                                                                                              |
| claim (noun)                      | réservation                                      |                                                                                                                                                                                            |
| gifter                            | "la personne qui offre", "qui offre"             | Not "donateur", which sounds like charity. "vos proches" when it means the people shopping for you; "Offert par" as a column label.                                                        |
| co-gifter                         | "offert avec", "cadeau commun"                   | Someone giving the same gift together with you. "les personnes qui offrent avec vous" in a sentence.                                                                                       |
| gift credit                       | crédit du cadeau                                 | Who is shown as having given a gift.                                                                                                                                                       |
| recipient                         | destinataire                                     | The person a list or gift is for.                                                                                                                                                          |
| reveal / revealed                 | révélation / révélé                              | The moment a recipient learns who gave what.                                                                                                                                               |
| off-list gift                     | cadeau hors liste                                | A gift that was not an item on the list.                                                                                                                                                   |
| primary list                      | liste principale                                 |                                                                                                                                                                                            |
| archive / archived                | archiver / archivé                               |                                                                                                                                                                                            |
| purchase                          | achat                                            |                                                                                                                                                                                            |
| received gifts                    | cadeaux reçus                                    |                                                                                                                                                                                            |
| partner                           | partenaire                                       | The person an account is paired with. Not "conjoint".                                                                                                                                      |
| dependent                         | profil géré                                      | Someone (a child, a pet) whose lists a guardian manages. Not "personne à charge", which is wrong for a pet.                                                                                |
| guardian                          | responsable                                      | The account that manages a dependent or a child account. Not "tuteur", which sounds legal. "Vous ne gérez pas ce profil" rather than a role noun addressed to the reader.                  |
| child account                     | compte enfant                                    | Plural "comptes enfants".                                                                                                                                                                  |
| gift exchange                     | échange de cadeaux                               | Secret Santa. "Échanges" alone in the admin nav. Plural "échanges de cadeaux".                                                                                                             |
| to draw names / the draw          | faire le tirage / le tirage                      | The button is "Faire le tirage". "Le tirage a eu lieu" rather than "les noms ont été tirés". Badges "Tirage à faire" / "Tirage effectué".                                                  |
| to redraw                         | refaire le tirage                                | Done: "Nouveau tirage effectué".                                                                                                                                                           |
| assignment (gift exchange)        | tirage                                           | Who someone drew: "Votre tirage est prêt". Not "attribution" or "affectation", which sound administrative. Whoever had a person is "la personne qui avait tiré {name}".                    |
| to gift to (gift exchange)        | offrir à                                         | "Qui peut offrir à qui", "Vous offrez à :". A question keeps its word order ("{name} peut offrir à cette personne ?"): no inverted pronoun that would agree with the name.                 |
| See Who You Have                  | Découvrir à qui offrir                           | The button that shows a person who they drew.                                                                                                                                              |
| member, people (gift exchange)    | personne / personnes                             | Not "membre" or "participant", which would need a gender. "les personnes qui y participent".                                                                                               |
| child (beside guardian)           | enfant                                           | The person with a child account, as in the Children card ("Enfants", "vos enfants").                                                                                                       |
| locked (gift exchange pair)       | bloqué                                           | A pair a fixed rule forbids. A pair an admin set to No is "Non".                                                                                                                           |
| Yes / No (an answer)              | Oui / Non                                        | Capitalised when it names the answer button: "Un administrateur a répondu Non".                                                                                                            |
| suggestions                       | suggestions                                      | The app's recommendations about your lists.                                                                                                                                                |
| to dismiss                        | ignorer                                          |                                                                                                                                                                                            |
| to skip (a step, a suggestion)    | passer                                           |                                                                                                                                                                                            |
| skipped (status of a job or run)  | non exécuté                                      | "exécution non effectuée" when the noun is "exécution". Never "ignoré", which means dismissed.                                                                                             |
| to acknowledge (an alert)         | répondre à l'alerte                              | The button is "J'ai compris". Not "prendre acte", which sounds administrative.                                                                                                             |
| editor (of a list)                | éditeur                                          | Next to a name, write "fait partie des éditeurs" so nothing agrees with it. As a legend or badge, "Peut modifier" (and "Peut consulter" for view access).                                  |
| pick-one group / in-order group   | groupe « un au choix » / groupe « dans l'ordre » |                                                                                                                                                                                            |
| to extend the reveal              | reporter la révélation                           | Not "prolonger".                                                                                                                                                                           |
| to-do / to-do list                | tâche / liste de tâches                          |                                                                                                                                                                                            |
| holiday                           | fête                                             | "fête personnalisée" for one an admin created.                                                                                                                                             |
| digest (email)                    | récapitulatif                                    |                                                                                                                                                                                            |
| run (of a job)                    | exécution                                        | "analyse" on the suggestions screens people see.                                                                                                                                           |
| provider                          | fournisseur                                      |                                                                                                                                                                                            |
| endpoint                          | point d'accès                                    |                                                                                                                                                                                            |
| deployment / instance             | déploiement                                      |                                                                                                                                                                                            |
| backup code                       | code de secours                                  |                                                                                                                                                                                            |
| attachment / receipt              | pièce jointe / justificatif d'achat              | Not "reçu", which reads as "received" next to "cadeaux reçus".                                                                                                                             |
| to impersonate                    | se connecter en tant que                         | Before a name or "cet utilisateur"; the button beside the user picker is just "Se connecter". Stopping is "Revenir à mon compte". Not "prendre l'identité", which reads as identity theft. |
| orphaned / attached (stored file) | orphelin / rattaché                              |                                                                                                                                                                                            |
| settings                          | paramètres                                       | Not "réglages".                                                                                                                                                                            |
| sign in / sign out                | se connecter / se déconnecter                    | Noun: "connexion". A menu entry or page title is the verb: "Se déconnecter".                                                                                                               |
| sign up                           | créer un compte                                  |                                                                                                                                                                                            |
| password                          | mot de passe                                     |                                                                                                                                                                                            |
| passkey                           | clé d'accès                                      |                                                                                                                                                                                            |
| two-factor authentication         | authentification à deux facteurs                 |                                                                                                                                                                                            |
| email                             | e-mail                                           |                                                                                                                                                                                            |
| to upload                         | importer                                         | A file or photo going from the device to the app.                                                                                                                                          |
| link, URL (what a person pastes)  | lien                                             | "URL" only on admin screens.                                                                                                                                                               |
| priority                          | priorité                                         |                                                                                                                                                                                            |
| notes                             | notes                                            |                                                                                                                                                                                            |
| vendor (shop an item comes from)  | boutique                                         | Not "vendeur", which is a salesperson.                                                                                                                                                     |
| price                             | prix                                             |                                                                                                                                                                                            |
| birthday                          | anniversaire                                     | A couple's "anniversary" is "anniversaire de couple".                                                                                                                                      |
| Christmas                         | Noël                                             | No article: "pour Noël".                                                                                                                                                                   |
| Mother's Day / Father's Day       | fête des Mères / fête des Pères                  |                                                                                                                                                                                            |
| Valentine's Day                   | Saint-Valentin                                   | With the article in a sentence: "la Saint-Valentin".                                                                                                                                       |
| admin                             | administrateur                                   | The role. The screen area is "Administration". A badge or tag next to a name is "admin" or "(admin)".                                                                                      |
| scraper / scraping (admin)        | extracteur / extraction                          | Reading a product page from its link.                                                                                                                                                      |
| token (AI usage)                  | token                                            | "jeton" only for an access or API token.                                                                                                                                                   |

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
