# Pouls — L’espace de la politique

Ouvrir **index.html** dans un navigateur moderne. Aucun serveur, aucune
installation et aucune connexion Internet ne sont nécessaires.

## Document scientifique et vidéo

- `modele-theorique.tex` suit le plan : références théoriques, hypothèses
  du modèle, résultats des simulations. Les références sont dans `references.bib`.
- `node simulation-results.cjs` recalcule neuf simulations de 500 tours :
  trois graines pour la référence, sans réputation et avec coût quadratique.
  Les résultats sont dans `simulation-results.json`, la table dans
  `simulation-summary.tex` et la trajectoire illustrée dans
  `simulation-trajectoires.csv`. Les paramètres et la règle de génération
  des graines sont enregistrés pour permettre la reproduction.
- Compiler avec `pdflatex -jobname=pouls-modele modele-theorique.tex`,
  puis `bibtex pouls-modele`, puis deux passes de la première commande.
  LaTeX nécessite `pgfplots`. Le document actualisé est `pouls-modele.pdf` ;
  l'ancien PDF n'est pas écrasé s'il est ouvert et verrouillé.
- Ouvrir `simulation-video.html` pour relire la référence, graine 314159,
  puis **Enregistrer la vidéo MP4** pour produire une vidéo sans son,
  encodée en H.264 dans un véritable conteneur MPEG-4.
  La vidéo contient uniquement la bande colorée du paysage politique
  (1 600 × 344), sans titre, axes, marqueurs, légende ni autres graphiques.
  L'abstention reste blanche et les teintes changent avec les nouveaux partis.
  L'enregistrement nécessite un navigateur prenant en charge MP4/H.264
  dans `MediaRecorder` (Chrome ou Edge récent compatible).
  Sans cet encodeur, une erreur explicite est affichée : aucun fichier WebM
  n'est renommé en MP4.
  Par défaut, elle utilise les 501 états de `simulation-video-data.js`,
  générés par le même script de résultats. **Charger la dernière simulation**
  relit l'expérience enregistrée dans le navigateur, avec ses paramètres,
  coûts, graines et générations, sans relancer la simulation.
  Les anciennes archives incompatibles sont refusées explicitement.
  Les fichiers se nomment `pouls-paysage-<tours>-tours-<source>.mp4`.

## Simulations paramétriques

Le notebook `simulation-parametrique.ipynb` répète les simulations avec un
électorat uniforme, sur une grille de paramètres définie dans le notebook. Il
reprend les règles du moteur, mais conserve un nombre fixe de candidats (sans
émergence ni remplacement).
Les valeurs de référence correspondent à l'application ; `PARAMETER_GRID`,
`N_REPLICATES` et `T_PERIODS` sont modifiables. Le notebook utilise NumPy,
pandas et Matplotlib. Il trace notamment les parts de marché moyennes dans le
temps, avec une bande d'un écart-type calculé à partir de la variance entre
réplications. Chaque exécution enregistre dans `simulation/data` les données
de synthèse, les trajectoires détaillées et les paramètres utilisés ; les noms
horodatés préservent les jeux précédents.

## Utilisation

Configuration des paramètres au chargement et après **Réinitialiser** :
électorat uniforme, α = 1, β = 3,5, k₀ = 1, k_max = 1,25,
γ = 0,1, η = 0,04 et bruit additif σ = 0,1 unité de coût.

- Choisir une distribution **uniforme** ou le **mélange à deux modes**.
  La distribution uniforme est sélectionnée au démarrage et après réinitialisation.
  Les centres, dispersions et poids du mélange restent mémorisés lors du passage
  à la distribution uniforme ; ses curseurs sont alors masqués.
- Quatre candidats sont affichés au démarrage, tous au centre, en position `0`.
  La réinitialisation rétablit ces positions centrales. Le nombre reste réglable de 2 à 7 et les
  positions se déplacent avec les curseurs.
- Les familles de couleurs sont fixes par place, sans dépendre des positions :
  A rouge vif, B orange corail, C or, D jaune solaire, E vert citron,
  F vert feuille, G vert profond. Cette palette jamaïcaine reprend sept
  teintes de la [référence proposée](https://fr.pinterest.com/pin/jamaican_colors--531284087284083941/).
  Les sept candidats ont des couleurs distinctes, sans répétition.
  Chaque renouvellement crée un nouveau parti avec une nouvelle teinte,
  utilisée dans les zones de vote, marqueurs, légendes, barres et trajectoires.
  `A·2` identifie le deuxième parti à la place A. Les courbes de position et
  de coût sont coupées à l'entrée, sans relier artificiellement deux partis.
  Les parts empilées changent de teinte à cette date, en conservant les couleurs
  historiques. Les légendes affichent les générations les plus récentes ;
  les infobulles identifient chaque segment historique.
  Les couches colorées ont une opacité de 80 %
  pour mieux les distinguer ; les lettres identifient aussi chaque candidat.
  Leur texte est noir ou blanc selon la couleur du marqueur, avec un
  contraste minimal de 4,5:1 pour les marqueurs, y compris les nouvelles teintes.
  Les couches empilées représentent la densité de vote espérée par candidat ;
  la couche blanche est celle des abstentionnistes. Leur somme restitue la
  densité de l'électorat.
- Régler le coût additif `kᵢ(t) + β × |x − pᵢ|^α` : linéaire pour `α = 1`,
  quadratique pour `α = 2`, ou intermédiaire avec le curseur.
  `kᵢ` est le coût de base, y compris à distance nulle ; **β** règle l'impact
  de la distance (valeur initiale 3,5, valeur 0 pour supprimer cet effet).
  Sans bruit, si `kᵢ > k_max`, le candidat n'est admissible pour aucun électeur.
- Le bruit est **additif** : `cᵢ = max(0, kᵢ + β × |x − pᵢ|^α + εᵢ)`,
  où `εᵢ` est gaussien centré, d'écart-type réglable (**0,1 unité de coût**
  par défaut, et non 10 % ; 0 pour désactiver le bruit).
  Un tirage indépendant par point d'électorat et candidat est renouvelé à
  chaque tour ou optimisation individuelle. Il reste fixe pour toutes les
  positions testées, les décisions simultanées et les votes affichés du tour.
  Le seuil `k_max` et le softmax utilisent ce même coût bruité.
  Les nouvelles expériences indiquent `noiseModel: "additive-gaussian"` ;
  les anciennes restent affichées avec leur bruit relatif multiplicatif.
  Les réglages d'abstention obtenus avec ce dernier doivent être recalibrés.
- Le seuil **k_max** est le coût spatial maximal accepté. Pour un électeur en
  `x`, seuls les candidats vérifiant `cᵢ(x) ≤ k_max` sont admissibles ; si aucun
  ne l'est, l'électeur s'abstient. Parmi les candidats admissibles, la
  probabilité de vote est le softmax `exp(−cᵢ(x)) / Σⱼ exp(−cⱼ(x))` (température
  fixée à 1).
  Les meilleurs déplacements maximisent les voix espérées rapportées à
  l'ensemble des électeurs.
- Les candidats dont le coût spatial dépasse `k_max` sont exclus pour cet
  électeur. Si tous dépassent le seuil, il s'abstient.
- Au départ, chaque candidat a `k = k₀`. Une modification manuelle des positions,
  de l'électorat ou des paramètres réinitialise les coûts à k₀ et l'historique
  à l'observation du nouveau scénario.
- Le succès `Sᵢ` est la moyenne des trois dernières parts des exprimés :
  poids 3 pour la plus récente, puis 2 et 1. Avec une ou deux observations,
  les poids disponibles (3 ou 3, 2) sont renormalisés. Sans participation,
  les parts sont nulles pour tous les candidats.
  Avant chaque tour, `kᵢ(t+1) = kᵢ(t) × exp[η × (1/N − Sᵢ)]`.
  Le curseur **Intensité de la réputation · η** vaut **0,04** par défaut,
  réglable de 0 à 2 par pas de 0,01. À 0, la réputation ne modifie plus les coûts,
  mais la mémoire des scores continue d'évoluer. Modifier η réinitialise
  les coûts à k₀ et l'historique à l'observation du scénario actuel, comme
  les autres paramètres de coût.
  Pour η > 0, un succès supérieur à la part égale `1/N` réduit le coût ; un succès
  inférieur l'augmente. Les coûts restent fixes pendant les recherches et
  le vote du tour. Le score produit est ajouté ensuite à la mémoire
  (trois observations au maximum), sans anticiper les votes futurs.
  **Optimiser** fait aussi avancer cette mémoire d'un pas et actualise tous
  les coûts, mais seul le candidat choisi se déplace.
  η est enregistré dans les paramètres de l'expérience et utilisé aussi
  pour le diagnostic final. Les expériences antérieures sans ce paramètre
  restent affichées avec leur ancienne intensité η = 1.
- **Optimiser** recherche la meilleure position d'un candidat à concurrents
  fixes. **Un tour** effectue une meilleure réponse pour chaque candidat,
  simultanément à partir du même état du tour précédent. Chaque candidat
  joue exactement une fois, sans tenir compte des décisions actuelles des autres.
  Au tour suivant, chacun découvre les positions effectivement choisies.
  Après les nouvelles entrées éventuelles, les candidats restants optimisent
  contre le même état. L'ordre de calcul ne donne aucun avantage.
- Le curseur **γ** borne chaque déplacement automatique :
  `|pᵢ(t+1) − pᵢ(t)| ≤ γ`, avec γ = 0,1 au démarrage (réglable de 0 à 2).
  À 0, les positions restent fixes hors renouvellements, mais les coûts et la mémoire évoluent ;
  à 2, tout l'axe est accessible. Modifier γ conserve les positions, coûts
  et scores passés. Les curseurs manuels de position définissent librement
  un nouveau scénario et ne sont pas soumis à cette limite.
- **Réinitialiser** rétablit tous les paramètres initiaux et les quatre candidats.
- **Innovation** : au début du tour suivant, une place dont le candidat n'a
  réellement aucune voix (pas seulement « 0,0 % » après arrondi) reçoit
  un nouvel entrant : coût remis à **1**, indépendamment de k₀, et mémoire
  de réputation effacée pour cette seule place. La position maximise la masse
  d'abstentionnistes du vote précédent admissibles à la nouvelle offre,
  avec k = 1, le seuil k_max et les chocs du nouveau tour. La recherche porte
  sur tout l'axe au pas 0,01 ; seul un ex aequo est tiré au hasard,
  reproductiblement à partir de la graine du tour. Les entrants choisissent
  indépendamment sur le même groupe d'abstentionnistes : ils peuvent se
  concurrencer, et la masse admissible n'est pas un nombre de votes garanti.
  Leur première position n'est pas bornée par γ.
  Les autres candidats optimisent ensuite simultanément contre le même
  état après arrivées ; les entrants ne se déplacent plus pendant ce tour.
  Sans abstentionnistes, les entrées sont reportées et signalées.
  Une optimisation individuelle ne renouvelle que la place sélectionnée.
  Les lettres restent attachées aux places, les teintes distinguent les générations.
  Les entrées sont marquées sur les trajectoires et enregistrées dans `entries`.
  Les longueurs de mémoire individuelles (`historyLengths`) excluent les
  scores des prédécesseurs sans modifier ceux des candidats restants.
  `initialPartyGenerations`, `partyGenerations` par tour et
  `finalPartyGenerations` préservent les identités visuelles lors d'une
  poursuite ou d'un export. Pour les archives sans ces champs, les générations
  sont reconstituées depuis les entrées enregistrées, à partir de zéro ;
  aucun changement n'est inventé à partir d'un simple saut de position.
  Une réinitialisation manuelle du scénario remet les générations à zéro ;
  modifier uniquement γ les conserve.
- Les boutons **Un tour** et **Simuler 500 tours** sont sous le graphique principal.
- **Interrompre** est disponible pendant la simulation. Le calcul s'arrête entre
  deux tours : les tours terminés sont affichés, enregistrés et exportables,
  avec la mention « interrompue ». Relancer poursuit depuis leur état final.
  Avant le premier tour, l'arrêt conserve le scénario et l'expérience précédente.
- **Simuler 500 tours** calcule au maximum 500 tours,
  depuis les positions et paramètres actuels.
  Après chaque tour, les positions, zones de vote, scores et coûts du graphique
  principal sont actualisés, ainsi que les courbes temporelles.
  Pendant le calcul, leur axe du temps reste fixé à 500 tours pour voir
  les trajectoires se construire. Le diagnostic et l'enregistrement sont
  effectués à la fin ou après interruption. Relancer poursuit depuis cet état.
  Un tour comprend
  une décision par candidat, appliquée simultanément.
- Sous les trajectoires de position, un graphique empilé suit les parts de
  marché et l'abstention en blanc, sur une échelle commune de 0 à 100 % de
  l'électorat. Il est actualisé à chaque tour et relu depuis les votes
  archivés, sans recalculer une ancienne expérience avec de nouvelles règles.
  Les nouvelles expériences enregistrent aussi `initialVotes` et
  `initialTurnout` pour afficher le tour 0 ; les archives qui n'en disposent
  pas commencent explicitement au tour 1.
- Les courbes temporelles affichent les positions en fin de tour (501 états,
  départ compris) et les coefficients k appliqués.
- Les courbes temporelles et la légende conservent les mêmes couleurs fixes
  par candidat.
  L’état complet inclut les positions, les coefficients k appliqués et
  l'historique des trois dernières parts des exprimés.
  Les décisions individuelles sont conservées dans l'export comme scénarios
  anticipés (seul le candidat concerné change). Ce ne sont pas des états
  effectivement traversés. La série `states` contient les 501 états réalisés,
  départ compris, quel que soit le nombre de candidats.
  Les anciennes expériences restent lisibles avec leur durée réelle ;
  elles sont identifiées avec leur ancienne règle de coût et leur dynamique.
- Le diagnostic mesure les déplacements des 20 derniers tours et le meilleur
  gain unilatéral avec les coefficients actualisés pour le prochain tour.
  Ces coefficients de diagnostic ne sont pas appliqués au graphique final.
  Avec bruit, le diagnostic garde le dernier tirage fixe et ne permet pas
  de conclure à la stationnarité après renouvellement du bruit ou évolution
  des coûts et de la mémoire.
  Une absence de gain sur la grille ne
  prouve pas la stabilité aux perturbations ni un équilibre continu.
- La dernière expérience est conservée dans le stockage local du navigateur,
  avec ses paramètres, positions initiales, mode simultané, décisions,
  et coûts initiaux et finaux.
  La graine initiale et une graine `noiseSeed` par tour sont enregistrées
  pour reproduire les chocs gaussiens sans stocker toute leur matrice.
  L'historique initial, les succès utilisés et l'historique final sont aussi
  enregistrés. Relancer conserve la mémoire et les coûts réalisés, sans
  réinitialisation ni double actualisation.
  Les scénarios anticipés sont détaillés dans `moves`. Le champ `order`
  identifie seulement l'ordre de calcul, sans effet sur le résultat. **Exporter les
  données (JSON)** permet de sauvegarder et d'analyser la réalisation exacte.
  Relancer poursuit la trajectoire et remplace l'expérience précédente.

## Conventions

L'axe va de très à gauche (`−1`) à très à droite (`+1`). La distribution uniforme
a une densité constante de 0,5 sur cet intervalle. Dans le mélange, les deux normales sont
tronquées et normalisées séparément sur cet intervalle, puis mélangées.
Le poids est la proportion de la composante gauche, pas nécessairement la
proportion des électeurs situés à gauche de zéro. Deux composantes peuvent
fusionner en un seul pic si elles sont proches ou suffisamment dispersées.

Chaque électeur choisit selon le softmax des coûts admissibles, de température
1. Les pourcentages principaux représentent l'ensemble des électeurs. Les
couches du graphique montrent la part locale de chaque candidat et des
abstentionnistes, pondérée par la densité électorale.

Le coût moyen attendu est calculé parmi les votants ; ce n'est pas un coût
effectivement payé.

L'intégration utilise 1 600 points médians. Chaque optimisation compare les
positions de la grille de pas 0,01 dans `[pᵢ − γ, pᵢ + γ] ∩ [−1, 1]`,
ainsi que la position actuelle et les deux bornes de cet intervalle.
Les coûts sont fixes pendant la recherche ; la position actuelle est conservée si aucun gain
n'est trouvé. Le gain est anticipé à positions adverses
inchangées et peut être annulé lors de l'application simultanée des décisions.
La recherche met en cache, pour chaque électeur, les contributions des
concurrents fixes au softmax. Chaque position testée ne recalcule ainsi que
le coût et la probabilité du candidat concerné, sans réduire la résolution,
changer le seuil d'admissibilité ni renouveler le bruit pendant la recherche.
Le diagnostic utilise la même borne γ ; il ne teste pas les déviations
hors de l'intervalle accessible. Ce calcul approché ne garantit ni convergence
ni équilibre de Nash. Le modèle
ne comprend ni valence, ni vote stratégique, ni données électorales réelles.

## Références

L'application affiche ces citations au-dessus des choix de forme du coût,
avec des liens vers sa bibliographie :

- Hotelling, H. (1929). *Stability in Competition*. **The Economic Journal**,
  39(153), 41–57. <https://doi.org/10.2307/2224214> — coût linéaire.
- d'Aspremont, C., Gabszewicz, J. J. et Thisse, J.-F. (1979).
  *On Hotelling's “Stability in Competition”*. **Econometrica**, 47(5),
  1145–1150. <https://doi.org/10.2307/1911955> — coût quadratique.

Le fichier [references.bib](references.bib) contient ces deux notices BibTeX
et se télécharge depuis la bibliographie de l'application.

Il s'agit des références des formes de coût spatial, pas d'une reproduction
de leurs modèles : le choix probabiliste, l'abstention, le bruit et la réputation
sont des mécanismes supplémentaires de l'application.

## Tests

Avec Node.js installé :

```text
node --test model.test.cjs
```

Le moteur dans **model.js** est indépendant de l'interface. Les tests couvrent
la normalisation, les deux pics initiaux, la conservation des voix, le softmax,
l'abstention, les formes de coût, l'optimalité sur la grille, les décisions
simultanées, le bruit et l'évolution des coûts selon le succès passé.
