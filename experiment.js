"use strict";
let experiment = null;
const experimentKey = "agora-experiment";
const simulationTurns = 500;
let interruptionRequested = false;

function chartAxes(width, height, xLabel, yLabel, time = false, turns = simulationTurns, min = -1, max = 1) {
  let svg = "";
  for (let i = 0; i <= 4; i++) {
    const x = 55 + i * (width - 80) / 4;
    const y = 25 + i * (height - 80) / 4;
    svg += `<line x1="${x}" x2="${x}" y1="25" y2="${height - 55}" stroke="#e6ecec"/>
      <line x1="55" x2="${width - 25}" y1="${y}" y2="${y}" stroke="#e6ecec"/>
      <text x="${x}" y="${height - 35}" text-anchor="middle" font-size="11" fill="#62747c">${time ? i * turns / 4 : number(min + i * (max - min) / 4)}</text>
      <text x="45" y="${y + 4}" text-anchor="end" font-size="11" fill="#62747c">${number(max - i * (max - min) / 4)}</text>`;
  }
  return svg + `<text x="${width / 2}" y="${height - 8}" text-anchor="middle" font-size="12" fill="#182d35">${xLabel}</text>
    <text transform="translate(14 ${height / 2}) rotate(-90)" text-anchor="middle" font-size="12" fill="#182d35">${yLabel}</text>`;
}
function renderExperiment(current = experiment, inProgress = false) {
  if (!current) {
    $("experiment-results").hidden = true;
    return;
  }
  const { settings: parameters, initial, rounds } = current;
  const count = initial.length;
  const distributionLabel = parameters.distribution === "uniform" ? "Distribution uniforme." :
    `Mélange à deux modes : ${number(parameters.leftMean)} / ${number(parameters.rightMean)} ; σ : ${number(parameters.leftSigma)} / ${number(parameters.rightSigma)} ; poids gauche : ${number(parameters.weight)}.`;
  $("experiment-results").hidden = false;
  const alienation = parameters.alienation === undefined ? 0 : parameters.alienation;
  const choiceModel = current.choiceModel || current.alienationModel;
  const alienationParameter = ["exponential-cumulative-displacement", "exponential-last-move"].includes(current.alienationModel) ?
    `η = ${number(alienation)}, ` : "";
  const successModel = current.costModel === "weighted-success-3-2-1";
  const modelLabel = choiceModel === "softmax-cost-cap" ?
    `Seuil d’acceptabilité : k_max = ${number(parameters.kMax)} ; ` +
    (successModel ? `coûts liés au succès sur les trois dernières parts des exprimés (poids 3, 2, 1 ; η = ${number(parameters.eta === undefined ? 1 : parameters.eta)}).` :
      "les coefficients k restent fixes.") :
    choiceModel === "exponential-cumulative-displacement" ?
    "Aliénation exponentielle cumulative : le déplacement multiplie le coefficient précédent." :
    choiceModel === "exponential-last-move" ?
    "Ancienne aliénation exponentielle : chaque déplacement repartait de k₀." :
    current.reputationModel === "exponential-popularity" ?
    `Ancienne expérience : popularité lissée exponentiellement, λ = ${number(parameters.lambda)} ; coût k₀ exp(−βg).` :
    current.reputationModel === "exponential-popularity-movement-memory" ?
    `Ancienne expérience : popularité et mémoire des déplacements, λ = ${number(parameters.lambda)}, γ = ${number(parameters.gamma)}, ρ = ${number(parameters.rho)}.` :
    current.reputationModel === "share-average-movement-memory" ?
    `Ancienne expérience : popularité moyenne et mémoire des déplacements, γ = ${number(parameters.gamma)}, ρ = ${number(parameters.rho)}.` :
    current.reputationModel === "share-average-movement" ?
    `Ancienne expérience : réputation moyenne, sans mémoire des déplacements ; γ = ${number(parameters.gamma)}.` :
    current.reputationModel === "smoothed-share-average" ?
    `Réputation sur la moyenne des deux dernières parts des exprimés, λ = ${number(parameters.smoothing)}.` :
    current.reputationModel === "smoothed-gain" ?
    `Ancienne expérience : réputation sur gains de voix, λ = ${number(parameters.smoothing)}.` :
    (current.initialShares ? "Ancienne expérience : réputation sur le niveau de voix, sans lissage." : "Ancienne expérience sans réputation.");
  const oldLimit = parameters.delta === undefined ? "" : ` Ancienne limite Δ = ${number(parameters.delta)}.`;
  const spatialCostLabel = current.spatialCostModel === "additive-distance" ?
    ` Coût additif kᵢ + β|x − pᵢ|^α ; β = ${number(parameters.beta)}.` :
    " Ancienne fonction de coût spatial multiplicative.";
  const noiseLabel = parameters.noiseSigma > 0 ?
    (current.noiseModel === "additive-gaussian" ?
      ` Bruit gaussien additif : σ = ${number(parameters.noiseSigma)} unité de coût, renouvelé à chaque tour.` :
      ` Ancien bruit gaussien relatif : σ = ${percent(parameters.noiseSigma)}, renouvelé à chaque tour.`) : "";
  const decisionLabel = current.decisionMode === "simultaneous" ?
    (current.entryModel === "max-abstainer-coverage" ?
      "Renouvellement à couverture maximale des abstentionnistes, puis décisions simultanées des candidats restants." :
      "Décisions simultanées sur les positions du tour précédent.") : "Ancienne expérience : décisions séquentielles en ordre aléatoire.";
  const movementLabel = current.movementModel === "bounded-displacement" ?
    ` Déplacement maximal par tour γ = ${number(parameters.gamma)}.` :
    " Ancienne expérience : déplacements non bornés par γ.";
  const eligibilityLabel = choiceModel === "softmax-cost-cap" ?
    "Seuls les candidats dont le coût spatial ne dépasse pas k_max sont admissibles." :
    current.eligibilityModel === "coefficient-limit" ?
    `Ancienne règle : les candidats dépassant τ = ${number(parameters.threshold)} étaient exclus.` :
    current.eligibilityModel ? "Ancienne règle : admissibilité fondée sur le coût spatial." :
    "Tous les candidats restent en compétition.";
  $("experiment-description").textContent = `Expérience du ${new Date(current.createdAt).toLocaleString("fr-FR")} — ${rounds.length} tours${inProgress ? " (en cours)" : current.interrupted ? " (interrompue)" : ""} ; départ : ${initial.map((p, i) => `${letter(i)} = ${number(p)}`).join(", ")}. ${distributionLabel} α = ${number(parameters.alpha)}, k₀ = ${number(parameters.scale)}, ${alienationParameter}${eligibilityLabel} ${modelLabel}${spatialCostLabel}${oldLimit}${noiseLabel} ${decisionLabel}${movementLabel} Paramètres figés pendant l’expérience.`;
  const samples = [initial, ...rounds.map(round => round.positions)];
  const generations = PartyStyle.timeline(current.initialPartyGenerations || initial.map(() => 0), rounds);
  const latestGenerations = generations[generations.length - 1];
  const latestLegend = initial.map((_, i) =>
    `<span><span class="swatch" style="background:${PartyStyle.color(i, latestGenerations[i])}"></span>${partyLabel(i, latestGenerations[i])}</span>`).join("");
  $("trajectory-legend").innerHTML = latestLegend;
  const duration = inProgress ? simulationTurns : Math.max(1, rounds.length);
  const tx = t => 55 + t * 820 / duration;
  const ty = p => 25 + (1 - p) * 120;
  let time = chartAxes(900, 320, "Tour", "Position", true, duration);
  $("time-chart").setAttribute("aria-label", `Trajectoires des positions sur ${rounds.length} tours`);
  for (let i = 0; i < count; i++) {
    for (const segment of PartyStyle.segments(generations, i)) {
      const { start, end, generation } = segment;
      const fill = PartyStyle.color(i, generation), label = partyLabel(i, generation);
      time += `<path class="time-trajectory" data-party="${label}" d="${samples.slice(start, end + 1).map((sample, j) => `${j ? "L" : "M"} ${tx(start + j)} ${ty(sample[i])}`).join(" ")}" fill="none" stroke="${fill}" stroke-width="2"><title>Parti ${label}</title></path>`;
    }
  }
  for (let t = 0; t < rounds.length; t++) {
    for (const entry of rounds[t].entries || []) {
      const generation = generations[t + 1][entry.candidate];
      time += `<circle class="entry-marker" cx="${tx(t + 1)}" cy="${ty(entry.position)}" r="3" fill="${PartyStyle.color(entry.candidate, generation)}" stroke="white"><title>Nouveau parti ${partyLabel(entry.candidate, generation)}, tour ${t + 1}, k = 1</title></circle>`;
    }
  }
  $("time-chart").innerHTML = time;
  const marketVotes = rounds.map((round, t) => ({ t: t + 1, votes: round.votes, turnout: round.turnout, generations: generations[t + 1] }));
  const hasInitialVote = Array.isArray(current.initialVotes) && Number.isFinite(current.initialTurnout);
  if (hasInitialVote) marketVotes.unshift({ t: 0, votes: current.initialVotes, turnout: current.initialTurnout, generations: generations[0] });
  const marketSamples = marketVotes.flatMap((sample, j) =>
    j > 0 && (rounds[sample.t - 1].entries || []).length ?
      [{ ...marketVotes[j - 1], t: sample.t }, sample] : [sample]);
  let market = chartAxes(900, 320, "Tour", "Part de l’électorat (%)", true, duration, 0, 100);
  const shareY = share => 25 + (1 - share) * 240;
  const totals = marketSamples.map(() => 0);
  for (let i = 0; i <= count; i++) {
    const bottom = [...totals];
    marketSamples.forEach((sample, t) => { totals[t] += i < count ? sample.votes[i] : Math.max(0, 1 - sample.turnout); });
    const segments = i < count ? PartyStyle.segments(marketSamples.map(sample => sample.generations), i) :
      [{ start: 0, end: marketSamples.length - 1, generation: 0 }];
    for (const { start, end, generation } of segments) {
      if (end < start) continue;
      const band = marketSamples.slice(start, end + 1).map((sample, j) =>
        ({ t: sample.t, lower: bottom[start + j], upper: totals[start + j] }));
      // Extend to the birth boundary without assigning the new party's vote to its predecessor.
      if (end + 1 < marketSamples.length) band.push({ ...band[band.length - 1], t: marketSamples[end + 1].t });
      const path = band.map((sample, j) => `${j ? "L" : "M"} ${tx(sample.t)} ${shareY(sample.upper)}`).join(" ") +
        [...band].reverse().map(sample => ` L ${tx(sample.t)} ${shareY(sample.lower)}`).join("") + " Z";
      const fill = i < count ? PartyStyle.color(i, generation) : "white";
      const label = i < count ? `Parti ${partyLabel(i, generation)}` : "Abstention";
      market += `<path class="market-layer" data-series="${i < count ? letter(i) : "abstention"}" data-generation="${generation}" d="${path}" fill="${fill}" fill-opacity="${i < count ? 0.8 : 1}" stroke="${i < count ? fill : "#a8b1b8"}" stroke-width="0.7"><title>${label}</title></path>`;
    }
  }
  $("market-chart").innerHTML = market;
  $("market-chart").setAttribute("aria-label", `Parts de marché et abstention sur ${rounds.length} tours, en pourcentage de tout l’électorat`);
  $("market-legend").innerHTML = latestLegend +
    '<span><span class="swatch" style="background:white;border:1px solid #a8b1b8"></span>Abstention</span>';
  $("market-chart-note").textContent = "Parts rapportées à tout l’électorat : candidats et abstention totalisent 100 %. " +
    (hasInitialVote ? "Le tour 0 correspond au vote initial." : "Cette archive ne contient pas le vote initial : les parts commencent au tour 1.");
  const hasCostHistory = Array.isArray(current.initialScales) &&
    rounds.every(round => Array.isArray(round.scales));
  $("cost-charts").hidden = !hasCostHistory;
  if (hasCostHistory) {
    const data = [current.initialScales, ...rounds.map(round => round.scales)];
    const maximum = Math.max(parameters.scale, ...data.flat());
    let svg = chartAxes(900, 320, "Tour", "Coefficient k appliqué", true, duration, 0, maximum);
    for (let i = 0; i < count; i++) {
      for (const { start, end, generation } of PartyStyle.segments(generations, i)) {
        const fill = PartyStyle.color(i, generation), label = partyLabel(i, generation);
        svg += `<path data-party="${label}" d="${data.slice(start, end + 1).map((sample, j) => `${j ? "L" : "M"} ${tx(start + j)} ${25 + (1 - sample[i] / maximum) * 240}`).join(" ")}" fill="none" stroke="${fill}" stroke-width="2"><title>Parti ${label}</title></path>`;
        if (start > 0) svg += `<circle cx="${tx(start)}" cy="${25 + (1 - data[start][i] / maximum) * 240}" r="3" fill="${fill}" stroke="white"><title>Nouveau parti ${label}, k = 1</title></circle>`;
      }
    }
    $("costs-chart").innerHTML = svg;
  }
  if (inProgress) {
    $("experiment-diagnostic").textContent = "Simulation en cours ; le diagnostic sera calculé à la fin.";
    return;
  }
  const entryCount = rounds.reduce((sum, round) => sum + (round.entries || []).length, 0);
  const lastMoves = rounds.slice(-20).flatMap(round => round.moves);
  const moving = lastMoves.filter(move => Math.abs(move.position - move.previous) > 1e-10).length;
  const maxGain = Math.max(...current.finalResponses.map(response => response.gain));
  $("experiment-diagnostic").textContent = `Sur les 20 derniers tours : ${moving} repositionnements effectifs sur ${lastMoves.length} décisions. Gain unilatéral maximal ${current.movementModel === "bounded-displacement" ? "sous la contrainte γ, " : ""}${successModel ? "avec les coûts du prochain tour, " : ""}à bruit final fixé : ${number(100 * maxGain)} points de voix. ` +
    (successModel ? "Diagnostic conditionnel : les coûts et la mémoire des parts de voix évoluent ; aucun équilibre n’est garanti, même sans déplacement profitable. " :
    parameters.noiseSigma > 0 ? "Diagnostic conditionnel au dernier tirage ; le bruit sera renouvelé au prochain tour, sans garantie de stationnarité. " :
    maxGain > 1e-10 ? "L’état final n’est pas un équilibre : au moins un candidat peut encore gagner des voix." :
      "Aucun gain de déplacement trouvé ; les coefficients k restent fixes. État stationnaire sur la grille, pas une preuve de stabilité face aux perturbations ni d’équilibre continu.") +
    " L’état inclut les positions et les coûts appliqués." +
    (current.entryModel === "max-abstainer-coverage" ?
      ` ${entryCount} nouvelles entrées depuis l’abstention. Le gain de déplacement est conditionnel aux candidats en place, avant tout prochain renouvellement.` : "") +
    ` Une seule trajectoire sur ${rounds.length} tours ne suffit pas à prouver la convergence ou un cycle.`;
}
async function simulateExperiment() {
  if (busy) return;
  busy = true;
  interruptionRequested = false;
  const controls = [...document.querySelectorAll("button:not(#interrupt), input, select")];
  controls.forEach(el => { el.disabled = true; });
  $("interrupt").disabled = false;
  const parameters = { ...settings };
  const initial = [...positions];
  const result = {
    createdAt: new Date().toISOString(), settings: parameters, initial,
    choiceModel: "softmax-cost-cap",
    costModel: "weighted-success-3-2-1",
    spatialCostModel: "additive-distance",
    movementModel: "bounded-displacement",
    noiseModel: "additive-gaussian",
    entryModel: "max-abstainer-coverage",
    decisionMode: "simultaneous",
    initialScales: [...activeScales], initialNoiseSeed: activeNoiseSeed,
    initialShareHistory: activeShareHistory.map(shares => [...shares]),
    initialHistoryLengths: [...activeHistoryLengths],
    initialPartyGenerations: [...activePartyGenerations],
    rounds: [], states: [[...initial]]
  };
  let current = [...initial];
  let previousScales = [...activeScales];
  let shareHistory = activeShareHistory.map(shares => [...shares]);
  let previousState = { noiseSeed: activeNoiseSeed, historyLengths: [...activeHistoryLengths] };
  let partyGenerations = [...activePartyGenerations];
  $("simulation-progress").hidden = false;
  $("simulation-progress").value = 0;
  $("simulation-progress").max = simulationTurns;
  $("error").hidden = true;
  try {
    const samplePoints = Hotelling.distribution(parameters);
    const initialVote = Hotelling.evaluate(Hotelling.noisePoints(samplePoints, initial, parameters, activeNoiseSeed),
      initial, { ...parameters, candidateScales: activeScales });
    result.initialVotes = [...initialVote.votes];
    result.initialTurnout = initialVote.turnout;
    renderExperiment(result, true);
    for (let t = 1; t <= simulationTurns; t++) {
      await new Promise(resolve => setTimeout(resolve, 0));
      if (interruptionRequested) break;
      const round = Hotelling.runRound(samplePoints, current, parameters, previousScales, shareHistory,
        current.map((_, i) => i), previousState);
      partyGenerations = PartyStyle.next(partyGenerations, round.entries);
      round.partyGenerations = [...partyGenerations];
      result.states.push([...round.positions]);
      result.rounds.push(round);
      current = round.positions;
      previousScales = round.scales;
      shareHistory = round.shareHistory;
      previousState = round;
      render(round);
      renderExperiment(result, true);
      $("simulation-progress").value = t;
      $("status").textContent = `Tour ${t} / ${simulationTurns} : positions, parts de voix et coûts actualisés.`;
      if (round.entries.length) $("status").textContent += ` Nouveaux entrants : ${round.entries.map(entry => letter(entry.candidate)).join(", ")} (k = 1).`;
      if (round.deferredEntries.length) $("status").textContent += " Entrées reportées : aucun abstentionniste disponible.";
      $("simulation-status").textContent = `Calcul : ${t} / ${simulationTurns} tours. Décisions simultanées des ${current.length} candidats.`;
    }
    const completedTurns = result.rounds.length;
    $("interrupt").disabled = true;
    result.interrupted = interruptionRequested && completedTurns < simulationTurns;
    if (completedTurns === 0) {
      renderExperiment();
      $("simulation-status").textContent = "Calcul interrompu avant le premier tour. Scénario et expérience précédente conservés.";
      return;
    }
    result.finalShareHistory = shareHistory.map(shares => [...shares]);
    result.finalHistoryLengths = [...previousState.historyLengths];
    result.finalPartyGenerations = [...partyGenerations];
    result.diagnosticScales = Hotelling.successCosts(previousScales, shareHistory, parameters.eta, previousState.historyLengths).scales;
    const nextSettings = { ...parameters, candidateScales: result.diagnosticScales };
    const finalRound = result.rounds[completedTurns - 1];
    const finalPoints = Hotelling.noisePoints(samplePoints, current, parameters, finalRound.noiseSeed);
    result.finalResponses = current.map((_, i) => Hotelling.bestResponse(finalPoints, current, nextSettings, i));
    experiment = result;
    renderExperiment();
    positions = [...current];
    activeScales = [...result.rounds[result.rounds.length - 1].scales];
    activeNoiseSeed = finalRound.noiseSeed;
    activeShareHistory = shareHistory.map(shares => [...shares]);
    activeHistoryLengths = [...previousState.historyLengths];
    activePartyGenerations = [...partyGenerations];
    render();
    $("status").textContent = `Positions finales des ${completedTurns} tours appliquées au graphique et aux coefficients k.`;
    localStorage.setItem(experimentKey, JSON.stringify(result));
    $("simulation-status").textContent = `${result.interrupted ? "Calcul interrompu après" : "Calcul terminé :"} ${completedTurns} tours. Graphique mis à jour et trajectoires enregistrées dans ce navigateur.`;
  } catch (error) {
    reportError(error);
    render();
    renderExperiment();
    $("simulation-status").textContent = "Erreur : " + error.message + ". L’expérience n’a pas pu être calculée ou enregistrée complètement.";
  } finally {
    busy = false;
    $("interrupt").disabled = true;
    $("simulation-progress").hidden = true;
    controls.forEach(el => { el.disabled = false; });
  }
}
$("simulate").addEventListener("click", simulateExperiment);
$("interrupt").addEventListener("click", () => {
  interruptionRequested = true;
  $("interrupt").disabled = true;
  $("simulation-status").textContent = "Interruption demandée ; arrêt entre deux tours, puis enregistrement des tours terminés.";
});
$("export-experiment").addEventListener("click", () => guarded(() => {
  if (!experiment) throw new Error("Aucune expérience à exporter.");
  const url = URL.createObjectURL(new Blob([JSON.stringify(experiment, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `pouls-trajectoires-${experiment.rounds.length}-tours.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}));
guarded(() => {
  const saved = localStorage.getItem(experimentKey);
  if (saved) {
    experiment = JSON.parse(saved);
    renderExperiment();
    $("simulation-status").textContent = "Dernière expérience restaurée. Les graphiques utilisent les paramètres indiqués ci-dessous, pas nécessairement ceux du scénario actuel.";
  }
});
