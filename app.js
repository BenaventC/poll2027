"use strict";
const defaults = {
  leftMean: -0.45, rightMean: 0.45, leftSigma: 0.22, rightSigma: 0.22,
  weight: 0.5, alpha: 1, beta: 3.5, gamma: 0.1, eta: 0.04, scale: 1, kMax: 1.25, noiseSigma: 0.1, distribution: "uniform"
};
const defaultPositions = [0, 0, 0, 0];
const colors = PartyStyle.colors;
let settings = { ...defaults };
let positions = [...defaultPositions];
let points;
let activeScales;
let activeNoiseSeed;
let activeShareHistory;
let activeHistoryLengths;
let activePartyGenerations;
let busy = false;
const $ = id => document.getElementById(id);
const number = value => value.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = value => `${(100 * value).toLocaleString("fr-FR", { maximumFractionDigits: 1, minimumFractionDigits: 1 })} %`;
const letter = i => String.fromCharCode(65 + i);
const partyLabel = (i, generation) => `${letter(i)}·${generation + 1}`;

function control(id, label, min, max, step, value) {
  return `<div class="control"><div class="control-top"><label for="${id}">${label}</label><output for="${id}" id="${id}-value">${number(value)}</output></div><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
}
function buildControls() {
  $("distribution-type").value = settings.distribution;
  updateDistributionControls();
  $("distribution-controls").innerHTML = [
    control("leftMean", "Centre du mode gauche", -1, 0, 0.01, settings.leftMean),
    control("rightMean", "Centre du mode droit", 0, 1, 0.01, settings.rightMean),
    control("leftSigma", "Dispersion à gauche · σ", 0.05, 0.6, 0.01, settings.leftSigma),
    control("rightSigma", "Dispersion à droite · σ", 0.05, 0.6, 0.01, settings.rightSigma),
    control("weight", "Poids de la composante gauche", 0, 1, 0.01, settings.weight)
  ].join("");
  $("cost-controls").innerHTML = [
    control("alpha", "Exposant · α", 0.5, 3, 0.05, settings.alpha),
    control("beta", "Impact de la distance · β", 0, 5, 0.05, settings.beta),
    control("scale", "Coût de base initial · k₀", 0.1, 3, 0.05, settings.scale),
    control("kMax", "Coût maximal accepté · k_max", 0.1, 3, 0.05, settings.kMax),
    control("noiseSigma", "Bruit additif · σ (unités de coût)", 0, 0.2, 0.01, settings.noiseSigma)
  ].join("");
  $("movement-controls").innerHTML = control("gamma", "Déplacement maximal par tour · γ", 0, 2, 0.01, settings.gamma);
  $("reputation-controls").innerHTML = control("eta", "Intensité de la réputation · η", 0, 2, 0.01, settings.eta);
  for (const key of Object.keys(defaults).filter(key => key !== "distribution")) {
    $(key).addEventListener("input", () => guarded(() => {
      settings[key] = Number($(key).value);
      $(`${key}-value`).textContent = number(settings[key]);
      if (["leftMean", "rightMean", "leftSigma", "rightSigma", "weight"].includes(key)) {
        points = Hotelling.distribution(settings);
      }
      if (key === "gamma") {
        $("status").textContent = `Déplacement maximal fixé à ${number(settings.gamma)} ; positions, coûts et mémoire conservés.`;
      } else {
        resetScales();
        $("status").textContent = "Paramètres modifiés ; les coefficients k sont réinitialisés à k₀.";
      }
      render();
    }));
  }
}
function updateDistributionControls() {
  const uniform = settings.distribution === "uniform";
  $("distribution-controls").hidden = uniform;
  $("distribution-description").textContent = uniform ?
    "Densité constante : chaque position de l’axe est aussi représentée." :
    "Deux gaussiennes tronquées sur l’axe politique.";
}
function resetScales() {
  activeScales = positions.map(() => settings.scale);
  activeNoiseSeed = Math.floor(Math.random() * 0x100000000);
  const noisyPoints = Hotelling.noisePoints(points, positions, settings, activeNoiseSeed);
  activeShareHistory = [Hotelling.expressedShares(
    Hotelling.evaluate(noisyPoints, positions, { ...settings, candidateScales: activeScales }))];
  activeHistoryLengths = positions.map(() => 1);
  activePartyGenerations = positions.map(() => 0);
}
$("distribution-type").addEventListener("change", () => guarded(() => {
  settings.distribution = $("distribution-type").value;
  points = Hotelling.distribution(settings);
  updateDistributionControls();
  resetScales();
  $("status").textContent = "Distribution modifiée ; les coefficients k sont réinitialisés à k₀.";
  render();
}));
function buildCandidates() {
  $("candidates").innerHTML = positions.map((p, i) => `
    <div class="candidate">
      <div class="candidate-name"><span id="swatch-${i}" class="swatch" style="background:${colors[i]}"></span>Candidat ${letter(i)}<span class="vote-sub" id="cost-${i}"></span></div>
      ${control(`position-${i}`, "Position", -1, 1, 0.01, p)}
      <div><span class="vote-number" id="votes-${i}"></span><span class="vote-sub" id="expressed-${i}"></span><div class="vote-bar"><span id="bar-${i}" style="background:${colors[i]}"></span></div></div>
      <button class="secondary optimize" data-candidate="${i}" aria-label="Optimiser la position du candidat ${letter(i)}">Optimiser ${letter(i)}</button>
    </div>`).join("");
  positions.forEach((p, i) => {
    $(`position-${i}`).addEventListener("input", () => guarded(() => {
      positions[i] = Number($(`position-${i}`).value);
      resetScales();
      $("status").textContent = `Position de ${letter(i)} modifiée ; les coefficients k sont réinitialisés à k₀.`;
      render();
    }));
  });
  document.querySelectorAll(".optimize").forEach(button => {
    button.addEventListener("click", () => optimize([Number(button.dataset.candidate)]));
  });
}
function drawChart(result, currentPositions, generations) {
  const partyColors = generations.map((generation, i) => PartyStyle.color(i, generation));
  const svg = $("landscape");
  const x = value => 35 + (value + 1) * 415;
  const maximum = Math.max(...points.map(p => p.density)) * 1.15;
  const y = density => 255 - density / maximum * 205;
  let markup = `<title>Densité de l’électorat et couches de probabilités de vote et d’abstention</title>`;
  for (let i = 0; i <= 4; i++) {
    const density = maximum * i / 4;
    markup += `<line x1="35" x2="865" y1="${y(density)}" y2="${y(density)}" stroke="#e6ecec"/>
      <text x="28" y="${y(density) + 4}" text-anchor="end" fill="#62747c" font-size="10">${density.toFixed(1)}</text>`;
  }
  markup += `<text x="35" y="20" fill="#62747c" font-size="11">Densité</text>`;
  const half = 1 / points.length;
  for (let layer = 0; layer <= currentPositions.length; layer++) {
    const band = result.assignments.map(assignment => {
      const abstention = Math.max(0, 1 - assignment.probabilities.reduce((sum, p) => sum + p, 0));
      const shares = [...assignment.probabilities, abstention];
      const lowerShare = shares.slice(0, layer).reduce((sum, p) => sum + p, 0);
      return {
        x: assignment.x, density: assignment.density,
        lower: assignment.density * lowerShare,
        upper: assignment.density * (lowerShare + shares[layer])
      };
    });
    const first = band[0], last = band[band.length - 1];
    const path = `M ${x(first.x - half)} ${y(first.upper)} ` +
      band.map(p => `L ${x(p.x)} ${y(p.upper)}`).join(" ") +
      ` L ${x(last.x + half)} ${y(last.upper)} L ${x(last.x + half)} ${y(last.lower)} ` +
      band.slice().reverse().map(p => `L ${x(p.x)} ${y(p.lower)}`).join(" ") +
      ` L ${x(first.x - half)} ${y(first.lower)} Z`;
    const label = layer === currentPositions.length ? "Abstention" : `Parti ${partyLabel(layer, generations[layer])}`;
    const abstentionLayer = layer === currentPositions.length;
    const fill = abstentionLayer ? "#ffffff" : partyColors[layer];
    const outline = abstentionLayer ? ` stroke="#78868b" stroke-width=".5"` : "";
    markup += `<path d="${path}" fill="${fill}" opacity="${abstentionLayer ? 1 : 0.8}"${outline}><title>${label}</title></path>`;
  }
  markup += `<path d="${points.map((p, i) => `${i ? "L" : "M"} ${x(p.x)} ${y(p.density)}`).join(" ")}" fill="none" stroke="#344e55" stroke-width="2"/>`;
  for (const tick of [-1, -0.5, 0, 0.5, 1]) {
    markup += `<text x="${x(tick)}" y="277" text-anchor="middle" font-size="11" fill="#62747c">${number(tick)}</text>`;
  }
  currentPositions.forEach((p, i) => {
    const top = 38 + (i % 3) * 18;
    markup += `<line x1="${x(p)}" x2="${x(p)}" y1="${top}" y2="255" stroke="${partyColors[i]}" stroke-width="2" stroke-dasharray="4 4"/>
      <circle cx="${x(p)}" cy="${top}" r="10" fill="${partyColors[i]}"><title>Parti ${partyLabel(i, generations[i])}</title></circle>
      <text x="${x(p)}" y="${top + 4}" text-anchor="middle" fill="${PartyStyle.textColor(partyColors[i])}" font-size="11" font-weight="700">${letter(i)}</text>`;
  });
  svg.innerHTML = markup;
  $("legend").innerHTML = currentPositions.map((p, i) => `<span><span class="swatch" style="background:${partyColors[i]}"></span>${partyLabel(i, generations[i])}</span>`).join("") +
    `<span><span class="swatch abstention-swatch" style="background:#fff"></span>Abstention</span>`;
}
function render(state = { positions, scales: activeScales, noiseSeed: activeNoiseSeed,
    shareHistory: activeShareHistory, historyLengths: activeHistoryLengths, partyGenerations: activePartyGenerations }) {
  const { positions: currentPositions, scales, noiseSeed, shareHistory, historyLengths, partyGenerations } = state;
  const noisyPoints = Hotelling.noisePoints(points, currentPositions, settings, noiseSeed);
  const result = Hotelling.evaluate(noisyPoints, currentPositions, { ...settings, candidateScales: scales }, true);
  const { success } = Hotelling.successCosts(scales, shareHistory, settings.eta, historyLengths);
  $("mean-cost").textContent = result.meanVotingCost === null ? "—" : number(result.meanVotingCost);
  $("turnout").textContent = percent(result.turnout);
  currentPositions.forEach((p, i) => {
    $(`position-${i}`).value = p;
    $(`position-${i}-value`).textContent = number(p);
    $(`votes-${i}`).textContent = percent(result.votes[i]);
    $(`expressed-${i}`).textContent = result.turnout > 1e-10 ?
      `${percent(result.votes[i] / result.turnout)} des exprimés` : "Aucun suffrage exprimé";
    $(`bar-${i}`).style.width = `${100 * result.votes[i]}%`;
    $(`cost-${i}`).textContent = `Parti ${partyLabel(i, partyGenerations[i])} · k appliqué : ${number(scales[i])} · succès : ${percent(success[i])}`;
    $(`swatch-${i}`).style.background = PartyStyle.color(i, partyGenerations[i]);
    $(`bar-${i}`).style.background = PartyStyle.color(i, partyGenerations[i]);
  });
  $("cost-cap-state").textContent = `Pour un électeur en x, un candidat est admissible si cᵢ(x) ≤ k_max = ${number(settings.kMax)}. Les probabilités des candidats admissibles sont proportionnelles à exp(−cᵢ(x)).`;
  for (const [id, exponent] of [["linear", 1], ["quadratic", 2]]) {
    $(id).classList.toggle("active", settings.alpha === exponent);
    $(id).setAttribute("aria-pressed", String(settings.alpha === exponent));
  }
  drawChart(result, currentPositions, partyGenerations);
}
function reportError(error) {
  $("error").hidden = false;
  $("error").textContent = `Erreur de simulation : ${error.message}`;
  $("status").textContent = "Le calcul n’a pas pu être terminé.";
  console.error(error);
}
function guarded(action) {
  $("error").hidden = true;
  try { action(); } catch (error) { reportError(error); }
}
function optimize(indices) {
  if (busy) return;
  busy = true;
  const controls = [...document.querySelectorAll("button:not(#interrupt), input, select")];
  controls.forEach(el => { el.disabled = true; });
  const orderLabel = indices.length > 1 ? "Tour simultané. " : "";
  $("status").textContent = `${orderLabel}Recherche de la meilleure position à distance maximale γ = ${number(settings.gamma)}…`;
  setTimeout(() => {
    try {
      $("error").hidden = true;
      const round = Hotelling.runRound(points, positions, settings, activeScales, activeShareHistory, indices,
        { noiseSeed: activeNoiseSeed, historyLengths: activeHistoryLengths });
      round.partyGenerations = PartyStyle.next(activePartyGenerations, round.entries);
      const messages = round.moves.map(move =>
        move.entry ? `Nouvel entrant ${letter(move.candidate)} → ${number(move.position)}, couverture maximale des abstentionnistes, k = 1` :
          `${letter(move.candidate)} → ${number(move.position)} (déplacement ${number(move.displacement)}) : ${percent(move.before)} → ${percent(move.after)} (+${number(100 * move.gain)} points)`);
      positions = round.positions;
      activeScales = round.scales;
      activeNoiseSeed = round.noiseSeed;
      activeShareHistory = round.shareHistory;
      activeHistoryLengths = round.historyLengths;
      activePartyGenerations = round.partyGenerations;
      render();
      $("status").textContent = orderLabel + messages.join(" ; ") + ". Gains anticipés à positions adverses inchangées ; les scores affichés résultent de tous les changements appliqués ensemble.";
      if (round.deferredEntries.length) $("status").textContent += " Entrées reportées : aucun abstentionniste disponible.";
    } catch (error) {
      reportError(error);
    } finally {
      busy = false;
      controls.forEach(el => { el.disabled = false; });
    }
  }, 30);
}
$("candidate-count").addEventListener("change", () => guarded(() => {
  const count = Number($("candidate-count").value);
  if (count < positions.length) positions = positions.slice(0, count);
  else while (positions.length < count) positions.push(0);
  buildCandidates();
  resetScales();
  $("status").textContent = "Nombre de candidats modifié ; les coefficients k sont réinitialisés. Les nouveaux candidats sont placés au centre.";
  render();
}));
for (const [id, exponent] of [["linear", 1], ["quadratic", 2]]) {
  $(id).addEventListener("click", () => guarded(() => {
    settings.alpha = exponent;
    $("alpha").value = exponent;
    $("alpha-value").textContent = number(exponent);
    resetScales();
    $("status").textContent = `Coût ${exponent === 1 ? "linéaire" : "quadratique"} sélectionné ; les coefficients k sont réinitialisés.`;
    render();
  }));
}
$("round").addEventListener("click", () => guarded(() => {
  if (busy) return;
  optimize(positions.map((_, i) => i));
}));
$("reset").addEventListener("click", () => guarded(() => {
  settings = { ...defaults };
  positions = [...defaultPositions];
  initialize();
  $("status").textContent = "Paramètres initiaux rétablis.";
}));
function initialize() {
  $("candidate-count").value = String(positions.length);
  points = Hotelling.distribution(settings);
  resetScales();
  buildControls();
  buildCandidates();
  render();
}
guarded(initialize);
