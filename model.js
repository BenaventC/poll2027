(function (root) {
  "use strict";
  const EPS = 1e-10;
  function validate(settings, positions) {
    if (settings.distribution !== undefined && !["uniform", "bimodal"].includes(settings.distribution)) {
      throw new Error("Distribution de l’électorat invalide.");
    }
    if (settings.kMax !== undefined && (!Number.isFinite(settings.kMax) || settings.kMax < 0)) {
      throw new Error("Le coût maximal accepté k_max doit être positif ou nul.");
    }
    if (settings.noiseSigma !== undefined && (!Number.isFinite(settings.noiseSigma) || settings.noiseSigma < 0)) {
      throw new Error("L’écart-type du bruit doit être positif ou nul.");
    }
    if (!Number.isFinite(settings.gamma) || settings.gamma < 0 || settings.gamma > 2) {
      throw new Error("Le déplacement maximal γ doit être compris entre 0 et 2.");
    }
    for (const key of ["leftMean", "rightMean", "leftSigma", "rightSigma", "weight", "alpha", "beta", "eta", "scale"]) {
      if (!Number.isFinite(settings[key])) throw new Error(`Paramètre invalide : ${key}`);
    }
    if (settings.leftMean < -1 || settings.leftMean > 1 || settings.rightMean < -1 || settings.rightMean > 1 ||
        settings.leftSigma <= 0 || settings.rightSigma <= 0 || settings.weight < 0 || settings.weight > 1 ||
        settings.alpha <= 0 || settings.beta < 0 || settings.eta < 0 || settings.scale <= 0) {
      throw new Error("Les paramètres sont hors des limites du modèle.");
    }
    if (positions && (positions.length < 2 || positions.length > 7 ||
        positions.some(p => !Number.isFinite(p) || p < -1 || p > 1))) {
      throw new Error("Il faut entre 2 et 7 positions dans [-1, 1].");
    }
    if (settings.candidateScales !== undefined &&
        (!Array.isArray(settings.candidateScales) ||
         (positions && settings.candidateScales.length !== positions.length) ||
         settings.candidateScales.some(k => !Number.isFinite(k) || k <= 0))) {
      throw new Error("Les coûts individuels doivent être positifs et correspondre aux candidats.");
    }
  }
  function distribution(settings, count = 1600) {
    validate(settings);
    if (!Number.isInteger(count) || count < 2) throw new Error("Résolution invalide.");
    const dx = 2 / count;
    if (settings.distribution === "uniform") {
      return Array.from({ length: count }, (_, i) => ({
        x: -1 + (i + 0.5) * dx, mass: 1 / count, density: 0.5
      }));
    }
    const points = Array.from({ length: count }, (_, i) => {
      const x = -1 + (i + 0.5) * dx;
      return {
        x,
        left: Math.exp(-0.5 * ((x - settings.leftMean) / settings.leftSigma) ** 2),
        right: Math.exp(-0.5 * ((x - settings.rightMean) / settings.rightSigma) ** 2)
      };
    });
    const leftSum = points.reduce((s, p) => s + p.left, 0);
    const rightSum = points.reduce((s, p) => s + p.right, 0);
    return points.map(p => {
      const mass = settings.weight * p.left / leftSum + (1 - settings.weight) * p.right / rightSum;
      return { x: p.x, mass, density: mass / dx };
    });
  }
  function cost(x, position, settings, scale = settings.scale) {
    return scale + settings.beta * Math.abs(x - position) ** settings.alpha;
  }
  function noisyCost(x, position, settings, scale, shock = 0) {
    const c = cost(x, position, settings, scale) + shock;
    if (!Number.isFinite(c)) throw new Error("Les coûts spatiaux dépassent les limites numériques.");
    return Math.max(0, c);
  }
  function seededRandom(seed) {
    if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) {
      throw new Error("Graine du bruit invalide.");
    }
    let state = seed;
    return () => {
      state = (Math.imul(1664525, state) + 1013904223) >>> 0;
      return state / 0x100000000;
    };
  }
  function noisePoints(points, positions, settings, seed) {
    validate(settings, positions);
    const random = seededRandom(seed);
    const sigma = settings.noiseSigma === undefined ? 0 : settings.noiseSigma;
    return points.map(point => ({
      ...point,
      costShocks: positions.map(() => {
        const gaussian = Math.sqrt(-2 * Math.log(1 - random())) * Math.cos(2 * Math.PI * random());
        return sigma * gaussian;
      })
    }));
  }
  function evaluate(points, positions, settings, details = false) {
    validate(settings, positions);
    const votes = positions.map(() => 0);
    let totalCost = 0, votingCost = 0;
    const assignments = [];
    const scales = positions.map((_, i) => settings.candidateScales === undefined ? settings.scale : settings.candidateScales[i]);
    for (const point of points) {
      if (point.costShocks !== undefined && (!Array.isArray(point.costShocks) ||
          point.costShocks.length !== positions.length || point.costShocks.some(shock => !Number.isFinite(shock)))) {
        throw new Error("Les chocs de bruit doivent être finis et correspondre aux candidats.");
      }
      const costs = positions.map((p, i) => noisyCost(point.x, p, settings, scales[i],
        point.costShocks === undefined ? 0 : point.costShocks[i]));
      const eligible = costs.map(c => settings.kMax === undefined || c <= settings.kMax);
      const minimum = Math.min(...costs.filter((_, i) => eligible[i]));
      if (!Number.isFinite(minimum)) {
        if (details) assignments.push({ ...point, winners: [], probabilities: positions.map(() => 0), cost: null });
        continue;
      }
      const weights = costs.map((c, i) => eligible[i] ? Math.exp(-(c - minimum)) : 0);
      const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
      const probabilities = weights.map(weight => weight / weightTotal);
      const expectedCost = probabilities.reduce((sum, probability, i) => sum + probability * costs[i], 0);
      totalCost += point.mass * expectedCost;
      probabilities.forEach((probability, i) => { votes[i] += point.mass * probability; });
      votingCost += point.mass * expectedCost;
      if (details) assignments.push({
        ...point, winners: probabilities.map((probability, i) => probability > 0 ? i : -1).filter(i => i >= 0),
        probabilities, cost: expectedCost
      });
    }
    const turnout = votes.reduce((a, b) => a + b, 0);
    return {
      votes, turnout, totalCost,
      meanVotingCost: turnout > EPS ? votingCost / turnout : null,
      assignments
    };
  }
  function bestResponse(points, positions, settings, candidate, steps = 200) {
    validate(settings, positions);
    if (!Number.isInteger(candidate) || candidate < 0 || candidate >= positions.length ||
        !Number.isInteger(steps) || steps < 2) throw new Error("Recherche de position invalide.");
    const before = evaluate(points, positions, settings).votes[candidate];
    let bestVotes = before, bestPosition = positions[candidate];
    const scales = settings.candidateScales === undefined ? positions.map(() => settings.scale) : settings.candidateScales;
    const baseScale = scales[candidate];
    const kMax = settings.kMax === undefined ? Infinity : settings.kMax;
    const rivals = positions.map((_, i) => i).filter(i => i !== candidate);
    // Les concurrents et le bruit restent fixes pour toute cette recherche.
    const electorate = points.map(point => {
      const costs = rivals.map(i => noisyCost(point.x, positions[i], settings, scales[i],
        point.costShocks === undefined ? 0 : point.costShocks[i])).filter(c => c <= kMax);
      const minimum = Math.min(...costs);
      return {
        x: point.x, mass: point.mass,
        shock: point.costShocks === undefined ? 0 : point.costShocks[candidate],
        minimum, weight: costs.reduce((sum, c) => sum + Math.exp(-(c - minimum)), 0)
      };
    });
    const lower = Math.max(-1, positions[candidate] - settings.gamma);
    const upper = Math.min(1, positions[candidate] + settings.gamma);
    const candidates = new Set([positions[candidate], lower, upper]);
    for (let j = 0; j <= steps; j++) {
      const position = -1 + 2 * j / steps;
      if (position >= lower && position <= upper) candidates.add(position);
    }
    for (const position of [...candidates].sort((a, b) => a - b)) {
      if (position === positions[candidate]) continue;
      let score = 0;
      for (const point of electorate) {
        const c = noisyCost(point.x, position, settings, baseScale, point.shock);
        if (c > kMax) continue;
        if (c <= point.minimum) {
          score += point.mass / (1 + point.weight * Math.exp(c - point.minimum));
        } else {
          const weight = Math.exp(-(c - point.minimum));
          score += point.mass * (weight / (weight + point.weight));
        }
      }
      if (score > bestVotes + EPS) {
        bestVotes = score;
        bestPosition = position;
      }
    }
    return {
      position: bestPosition, before, after: bestVotes, gain: bestVotes - before,
      baseScale, scale: baseScale,
      displacement: Math.abs(bestPosition - positions[candidate])
    };
  }
  function randomOrder(count, random = Math.random) {
    if (!Number.isInteger(count) || count < 2 || count > 7 || typeof random !== "function") {
      throw new Error("Tirage de l’ordre des candidats invalide.");
    }
    const order = Array.from({ length: count }, (_, i) => i);
    for (let i = count - 1; i > 0; i--) {
      const draw = random();
      if (!Number.isFinite(draw) || draw < 0 || draw >= 1) {
        throw new Error("Le tirage aléatoire doit être compris dans [0, 1[.");
      }
      const j = Math.floor(draw * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return order;
  }
  function expressedShares(result) {
    return result.votes.map(vote => result.turnout > EPS ? vote / result.turnout : 0);
  }
  function successCosts(previousScales, shareHistory, eta, historyLengths) {
    if (!Number.isFinite(eta) || eta < 0) {
      throw new Error("L’intensité de réputation η doit être positive ou nulle.");
    }
    if (!Array.isArray(previousScales)) throw new Error("Coûts ou historique des parts de voix invalides.");
    const count = previousScales.length;
    if (count < 2 || count > 7 || previousScales.some(k => !Number.isFinite(k) || k <= 0) ||
        !Array.isArray(shareHistory) || shareHistory.length > 3 ||
        shareHistory.some(shares => !Array.isArray(shares) || shares.length !== count ||
          shares.some(share => !Number.isFinite(share) || share < 0 || share > 1) ||
          shares.reduce((sum, share) => sum + share, 0) > 1 + EPS)) {
      throw new Error("Coûts ou historique des parts de voix invalides.");
    }
    const lengths = historyLengths === undefined ? previousScales.map(() => shareHistory.length) : historyLengths;
    if (!Array.isArray(lengths) || lengths.length !== count ||
        lengths.some(length => !Number.isInteger(length) || length < 0 || length > shareHistory.length)) {
      throw new Error("Les longueurs de mémoire doivent correspondre aux candidats et à l’historique.");
    }
    const success = previousScales.map((_, i) => {
      const weights = [3, 2, 1].slice(0, lengths[i]);
      const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
      return weightTotal === 0 ? 1 / count :
        weights.reduce((sum, weight, j) => sum + weight * shareHistory[shareHistory.length - 1 - j][i], 0) / weightTotal;
    });
    const scales = previousScales.map((scale, i) => scale * Math.exp(eta * (1 / count - success[i])));
    if (scales.some(k => !Number.isFinite(k) || k <= 0)) {
      throw new Error("Les coûts liés au succès dépassent les limites numériques.");
    }
    return { success, scales, historyLengths: [...lengths] };
  }
  function runRound(points, positions, settings, previousScales = positions.map(() => settings.scale),
      shareHistory = [], candidates = positions.map((_, i) => i), previousState = {}) {
    validate(settings, positions);
    if (!Array.isArray(previousScales) || previousScales.length !== positions.length ||
        previousScales.some(k => !Number.isFinite(k) || k <= 0)) {
      throw new Error("Les coûts précédents doivent être positifs et correspondre aux candidats.");
    }
    if (!Array.isArray(candidates) || candidates.length === 0 || new Set(candidates).size !== candidates.length ||
        candidates.some(i => !Number.isInteger(i) || i < 0 || i >= positions.length)) {
      throw new Error("Liste des candidats à optimiser invalide.");
    }
    if (!previousState || typeof previousState !== "object" || Array.isArray(previousState)) {
      throw new Error("État précédent invalide.");
    }
    const { historyLengths } = successCosts(previousScales, shareHistory, 0, previousState.historyLengths);
    const noiseSeed = settings.noiseSeed === undefined ? Math.floor(Math.random() * 0x100000000) : settings.noiseSeed;
    const roundPoints = noisePoints(points, positions, settings, noiseSeed);
    const decisionPositions = [...positions], startingScales = [...previousScales];
    const entries = [], deferredEntries = [];
    const potentialEntries = shareHistory.length === 0 ? [] :
      candidates.filter(i => shareHistory[shareHistory.length - 1][i] === 0);
    if (potentialEntries.length) {
      if (settings.noiseSigma > 0 && previousState.noiseSeed === undefined) {
        throw new Error("La graine du vote précédent est nécessaire pour retrouver les abstentionnistes.");
      }
      const previousPoints = noisePoints(points, positions, settings,
        previousState.noiseSeed === undefined ? 0 : previousState.noiseSeed);
      const previousVote = evaluate(previousPoints, positions, { ...settings, candidateScales: previousScales }, true);
      const inactive = potentialEntries.filter(i => previousVote.votes[i] === 0);
      const abstainers = roundPoints.filter((point, index) =>
        previousVote.assignments[index].winners.length === 0 && point.mass > 0);
      const mass = abstainers.reduce((sum, point) => sum + point.mass, 0);
      const random = seededRandom((noiseSeed ^ 0x9e3779b9) >>> 0);
      for (const candidate of inactive) {
        if (mass === 0) {
          deferredEntries.push(candidate);
          continue;
        }
        let recruitmentMass = -1, bestPositions = [];
        for (let j = 0; j <= 200; j++) {
          const position = -1 + j / 100;
          const reachable = abstainers.reduce((sum, point) =>
            sum + (noisyCost(point.x, position, settings, 1, point.costShocks[candidate]) <=
              (settings.kMax === undefined ? Infinity : settings.kMax) ? point.mass : 0), 0);
          if (reachable > recruitmentMass) {
            recruitmentMass = reachable;
            bestPositions = [position];
          } else if (reachable === recruitmentMass) bestPositions.push(position);
        }
        const position = bestPositions[Math.floor(random() * bestPositions.length)];
        decisionPositions[candidate] = position;
        startingScales[candidate] = 1;
        historyLengths[candidate] = 0;
        entries.push({
          candidate, previous: positions[candidate], position,
          previousScale: previousScales[candidate], scale: 1, recruitmentMass
        });
      }
    }
    const { success, scales: baseScales } = successCosts(startingScales, shareHistory, settings.eta, historyLengths);
    const scales = [...baseScales];
    const turnSettings = { ...settings, candidateScales: baseScales };
    const order = [...candidates];
    const next = [...decisionPositions];
    const entryVotes = entries.length ? evaluate(roundPoints, decisionPositions, turnSettings).votes : [];
    const moves = [];
    for (const candidate of order) {
      const entry = entries.find(entry => entry.candidate === candidate);
      const response = entry ? {
        entry: true, position: entry.position, before: 0, after: entryVotes[candidate], gain: entryVotes[candidate],
        baseScale: 1, scale: 1, displacement: Math.abs(entry.position - positions[candidate])
      } : bestResponse(roundPoints, decisionPositions, turnSettings, candidate);
      next[candidate] = response.position;
      scales[candidate] = response.scale;
      const anticipatedPositions = [...decisionPositions], anticipatedScales = [...baseScales];
      anticipatedPositions[candidate] = response.position;
      anticipatedScales[candidate] = response.scale;
      moves.push({
        candidate, previous: positions[candidate], ...response,
        positions: anticipatedPositions, scales: anticipatedScales
      });
    }
    const result = evaluate(roundPoints, next, { ...settings, candidateScales: scales });
    const shares = expressedShares(result);
    return {
      decisionMode: "simultaneous", noiseSeed, order, positions: next, moves, scales, baseScales,
      entries, deferredEntries, decisionPositions,
      previousScales: [...previousScales],
      success, shares, shareHistory: [...shareHistory.slice(-2).map(shares => [...shares]), shares],
      historyLengths: historyLengths.map(length => Math.min(3, length + 1)),
      votes: result.votes, turnout: result.turnout
    };
  }
  const api = { distribution, cost, noisePoints, evaluate, bestResponse, randomOrder, runRound, expressedShares, successCosts };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Hotelling = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
