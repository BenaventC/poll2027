const { test } = require("node:test");
const assert = require("node:assert/strict");
const H = require("./model.js");
const settings = {
  leftMean: -0.45, rightMean: 0.45, leftSigma: 0.22, rightSigma: 0.22,
  weight: 0.5, alpha: 1, beta: 1, gamma: 2, eta: 1, scale: 1
};
const near = (actual, expected, tolerance = 1e-9) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
test("la distribution uniforme a une densité constante et une masse totale de 1", () => {
  for (const count of [100, 1600]) {
    const points = H.distribution({ ...settings, distribution: "uniform" }, count);
    assert.equal(points.length, count);
    points.forEach(p => { assert.equal(p.density, 0.5); assert.equal(p.mass, 1 / count); });
    near(points.reduce((sum, p) => sum + p.mass, 0), 1);
    const result = H.evaluate(points, [-0.5, 0.5], settings);
    result.votes.forEach(v => near(v, 0.5));
    near(result.turnout, 1);
  }
});
test("le mélange explicite conserve le modèle existant et les types invalides sont rejetés", () => {
  assert.deepEqual(H.distribution({ ...settings, distribution: "bimodal" }), H.distribution(settings));
  assert.throws(() => H.distribution({ ...settings, distribution: "inconnue" }));
});
test("distribution normalisée, symétrique et à deux pics avec les paramètres initiaux", () => {
  const points = H.distribution(settings);
  near(points.reduce((s, p) => s + p.mass, 0), 1);
  near(points[100].density, points[points.length - 101].density);
  const peaks = points.filter((p, i) => i > 0 && i < points.length - 1 &&
    p.density > points[i - 1].density && p.density > points[i + 1].density);
  assert.equal(peaks.length, 2);
});
test("le poids correspond aux composantes tronquées, même aux extrémités", () => {
  const left = H.distribution({ ...settings, leftMean: -1, weight: 1 });
  const right = H.distribution({ ...settings, weight: 0 });
  const mixture = H.distribution({ ...settings, leftMean: -1, weight: 0.3 });
  mixture.forEach((p, i) => near(p.mass, 0.3 * left[i].mass + 0.7 * right[i].mass));
});
test("conservation des voix pour 2 à 7 candidats et plusieurs coûts", () => {
  for (const count of [2, 3, 4, 5, 6, 7]) for (const alpha of [0.5, 1, 2, 3]) {
    const s = { ...settings, alpha };
    const result = H.evaluate(H.distribution(s), Array.from({ length: count }, (_, i) => -1 + 2 * i / (count - 1)), s);
    near(result.turnout, 1);
    assert.ok(result.votes.every(v => v >= 0));
  }
});
test("le softmax réagit à la forme du coût", () => {
  const points = H.distribution(settings);
  const s = settings;
  const first = H.evaluate(points, [-0.4, 0.2, 0.75], s);
  const second = H.evaluate(points, [-0.4, 0.2, 0.75], { ...s, alpha: 2 });
  assert.ok(first.votes.some((v, i) => Math.abs(v - second.votes[i]) > 1e-4));
  near(first.turnout, 1);
});
test("les candidats superposés reçoivent des probabilités égales", () => {
  const points = H.distribution(settings);
  const result = H.evaluate(points, [0, 0, 0], settings, true);
  result.votes.forEach(v => near(v, result.turnout / 3));
  const costly = H.evaluate([{ x: 0.5, mass: 1, density: 1 }], [0.49, -1], {
    ...settings, candidateScales: [3, 1]
  });
  near(costly.votes[0], 1 / (1 + Math.exp(0.51)));
  near(costly.votes[1], 1 - 1 / (1 + Math.exp(0.51)));
  near(costly.turnout, 1);
  assert.equal(H.evaluate([], [0, 1], settings).meanVotingCost, null);
});
test("k_max exclut les coûts trop élevés et provoque l’abstention si aucun candidat n’est admissible", () => {
  const point = [{ x: 0.5, mass: 1, density: 1 }];
  const abstention = H.evaluate(point, [-1, -0.6], { ...settings, kMax: 1 }, true);
  assert.deepEqual(abstention.votes, [0, 0]);
  assert.equal(abstention.turnout, 0);
  assert.equal(abstention.assignments[0].cost, null);
  const eligible = H.evaluate(point, [0, 0.5], { ...settings, kMax: 1.5 });
  assert.ok(eligible.votes[1] > eligible.votes[0]);
  near(eligible.turnout, 1);
  const partial = H.evaluate([
    { x: 0, mass: 0.25, density: 1 },
    { x: 1, mass: 0.75, density: 1 }
  ], [0, 0.5], { ...settings, kMax: 1.2 });
  near(partial.turnout, 0.25);
  near(partial.votes.reduce((sum, vote) => sum + vote, 0), partial.turnout);
});
test("les coûts suivent k + beta × distance^alpha, avec un coût de base à distance nulle", () => {
  near(H.cost(-0.5, 0.5, { ...settings, scale: 2 }), 3);
  near(H.cost(0, 0.5, { ...settings, scale: 2, alpha: 2, beta: 3 }), 2.75);
  near(H.cost(0.5, 0.5, settings, 2), 2);
  near(H.cost(-1, 1, { ...settings, beta: 0 }, 3), 3);
});
test("beta règle uniquement l’impact de la distance dans le softmax et le seuil", () => {
  const points = [{ x: 0, mass: 1, density: 1 }];
  const positions = [0, 1];
  const noDistance = H.evaluate(points, positions, { ...settings, beta: 0 });
  assert.deepEqual(noDistance.votes, [0.5, 0.5]);
  const distance = H.evaluate(points, positions, { ...settings, beta: 2 });
  near(distance.votes[0], 1 / (1 + Math.exp(-2)));
  assert.deepEqual(H.evaluate(points, positions, { ...settings, beta: 2, kMax: 1 }).votes, [1, 0]);
  assert.deepEqual(H.evaluate(points, positions, { ...settings, beta: 0, kMax: 0.9 }).votes, [0, 0]);
});
test("la meilleure réponse est maximale sur la grille, ne diminue pas les voix et ne modifie pas les positions", () => {
  const points = H.distribution(settings, 400);
  const positions = [-0.9, 0.35, 0.6];
  const response = H.bestResponse(points, positions, settings, 0);
  assert.deepEqual(positions, [-0.9, 0.35, 0.6]);
  assert.ok(response.after >= response.before);
  assert.ok(response.gain > 0);
  for (let i = 0; i <= 200; i++) {
    const score = H.evaluate(points, [-1 + i / 100, ...positions.slice(1)], settings).votes[0];
    assert.ok(score <= response.after + 1e-10);
  }
});
test("en l’absence de gain, la position actuelle hors grille est conservée", () => {
  const points = [{ x: 0.123, mass: 1, density: 1 }];
  const response = H.bestResponse(points, [0.123, 0.9], settings, 0);
  near(response.position, 0.123);
  near(response.gain, 0);
});
test("la recherche mise en cache reproduit le calcul complet du softmax", () => {
  for (let count = 2; count <= 7; count++) {
    const positions = Array.from({ length: count }, (_, i) => -0.83 + i * 1.66 / (count - 1));
    for (const parameters of [
      { ...settings, gamma: 0.13, alpha: 0.7, kMax: 1.3, noiseSigma: 0.2 },
      { ...settings, gamma: 2, alpha: 2, beta: 3, noiseSigma: 0.05 },
      { ...settings, gamma: 0, kMax: 0 },
      { ...settings, gamma: 2, candidateScales: positions.map((_, i) => 1000 * (i + 1)) }
    ]) {
      const points = H.noisePoints(H.distribution(parameters, 24), positions, parameters, 42);
      for (let candidate = 0; candidate < count; candidate++) {
        const lower = Math.max(-1, positions[candidate] - parameters.gamma);
        const upper = Math.min(1, positions[candidate] + parameters.gamma);
        const trials = new Set([positions[candidate], lower, upper]);
        for (let j = 0; j <= 20; j++) {
          const position = -1 + 2 * j / 20;
          if (position >= lower && position <= upper) trials.add(position);
        }
        const before = H.evaluate(points, positions, parameters).votes[candidate];
        let expectedPosition = positions[candidate], expectedVotes = before;
        for (const position of [...trials].sort((a, b) => a - b)) {
          const trial = [...positions];
          trial[candidate] = position;
          const votes = H.evaluate(points, trial, parameters).votes[candidate];
          if (votes > expectedVotes + 1e-10) {
            expectedVotes = votes;
            expectedPosition = position;
          }
        }
        const actual = H.bestResponse(points, positions, parameters, candidate, 20);
        near(actual.position, expectedPosition);
        near(actual.before, before, 1e-12);
        near(actual.after, expectedVotes, 1e-12);
        near(actual.gain, expectedVotes - before, 1e-12);
      }
    }
  }
});
test("la recherche mise en cache gère l’admissibilité et les erreurs numériques", () => {
  const points = [{ x: 0, mass: 1, costShocks: [0, 0] }];
  const response = H.bestResponse(points, [-1, 1], { ...settings, kMax: 1 }, 0);
  near(response.position, 0);
  near(response.before, 0);
  near(response.after, 1);
  assert.throws(() => H.bestResponse([{ ...points[0], costShocks: [NaN, 0] }], [0, 0], settings, 0), /chocs de bruit/);
  assert.throws(() => H.bestResponse([{ ...points[0], costShocks: [Number.MAX_VALUE, 0] }], [0, 0],
    { ...settings, beta: Number.MAX_VALUE }, 0), /limites numériques/);
});
test("les paramètres invalides sont signalés explicitement", () => {
  assert.throws(() => H.distribution({ ...settings, leftSigma: 0 }));
  assert.throws(() => H.distribution({ ...settings, alpha: NaN }));
  for (const beta of [-1, NaN, Infinity, undefined]) {
    assert.throws(() => H.distribution({ ...settings, beta }));
  }
  for (const gamma of [-0.1, 2.01, NaN, Infinity, undefined]) {
    assert.throws(() => H.distribution({ ...settings, gamma }), /déplacement maximal/);
  }
  assert.throws(() => H.evaluate([], [0], settings));
  assert.throws(() => H.bestResponse([], [0, 1], settings, 2));
});
test("l’ordre aléatoire contient chaque candidat exactement une fois pour 2 à 7 candidats", () => {
  for (let count = 2; count <= 7; count++) {
    for (const draw of [0, 0.25, 0.5, 0.75, 0.999999]) {
      let calls = 0;
      const order = H.randomOrder(count, () => { calls++; return draw; });
      assert.deepEqual([...order].sort((a, b) => a - b), Array.from({ length: count }, (_, i) => i));
      assert.equal(calls, count - 1);
    }
  }
});
test("Fisher-Yates produit les 24 permutations de quatre candidats une seule fois", () => {
  const permutations = new Set();
  for (let a = 0; a < 4; a++) for (let b = 0; b < 3; b++) for (let c = 0; c < 2; c++) {
    const draws = [(a + 0.5) / 4, (b + 0.5) / 3, (c + 0.5) / 2];
    permutations.add(H.randomOrder(4, () => draws.shift()).join(","));
  }
  assert.equal(permutations.size, 24);
});
test("chaque appel retire un ordre, sans mémoriser ni imposer l’alternance", () => {
  assert.deepEqual(H.randomOrder(4, () => 0), [1, 2, 3, 0]);
  assert.deepEqual(H.randomOrder(4, () => 0.999999), [0, 1, 2, 3]);
  assert.deepEqual(H.randomOrder(4, () => 0), [1, 2, 3, 0]);
});
test("les paramètres et tirages aléatoires invalides sont signalés", () => {
  for (const count of [1, 8, 2.5, NaN]) assert.throws(() => H.randomOrder(count));
  assert.throws(() => H.evaluate([], Array(8).fill(0), settings));
  assert.throws(() => H.randomOrder(4, null));
  for (const draw of [-0.1, 1, NaN, Infinity]) {
    assert.throws(() => H.randomOrder(4, () => draw));
  }
});
test("un tour applique ensemble les meilleures réponses au même état initial", () => {
  const parameters = { ...settings };
  const points = H.distribution(parameters, 200);
  const initial = [-0.65, -0.2, 0.2, 0.65];
  const round = H.runRound(points, initial, parameters);
  assert.equal(round.decisionMode, "simultaneous");
  assert.deepEqual(round.order, [0, 1, 2, 3]);
  let expected = [...initial];
  for (const move of round.moves) {
    const response = H.bestResponse(points, initial, parameters, move.candidate);
    expected[move.candidate] = response.position;
    const anticipated = [...initial];
    anticipated[move.candidate] = response.position;
    assert.deepEqual(move.positions, anticipated);
    near(move.gain, response.gain);
  }
  assert.deepEqual(round.positions, expected);
  assert.deepEqual(initial, [-0.65, -0.2, 0.2, 0.65]);
});
test("les tours successifs conservent les coefficients k", () => {
  const parameters = { ...settings, kMax: 1.8 };
  const points = H.distribution(parameters, 20);
  let current = [-0.9, 0, 0.9];
  const samples = [[...current]], states = [[...current]];
  let previousScales = current.map(() => parameters.scale);
  for (let t = 0; t < 30; t++) {
    const round = H.runRound(points, current, parameters, previousScales);
    assert.deepEqual(round.baseScales, previousScales);
    assert.deepEqual(round.previousScales, previousScales);
    assert.deepEqual(round.scales, previousScales);
    previousScales = round.scales;
    for (const move of round.moves) {
      move.positions.forEach((p, i) => {
        assert.ok(p >= -1 && p <= 1);
        if (i === move.candidate) near(move.scale, move.baseScale);
        else assert.equal(p, current[i]);
      });
    }
    states.push(round.positions);
    current = round.positions;
    samples.push(current);
  }
  assert.equal(samples.length, 31);
  assert.equal(states.length, 31);
  assert.deepEqual(samples[30], states[30]);
});
test("les coûts individuels peuvent faire gagner le candidat plus éloigné", () => {
  const points = [{ x: 0.4, mass: 1, density: 1 }];
  const result = H.evaluate(points, [0, 1], { ...settings, candidateScales: [1, 0.25] });
  near(result.votes[1], 1 / (1 + Math.exp(-0.55)));
  near(result.totalCost, result.votes[0] * 1.4 + result.votes[1] * 0.85);
});
test("le tour suivant utilise les positions et coûts effectivement réalisés", () => {
  const parameters = { ...settings, distribution: "uniform" };
  const points = H.distribution(parameters, 80), initial = [0, 0, 0, 0];
  const round = H.runRound(points, initial, parameters);
  const next = H.runRound(points, round.positions, parameters, round.scales);
  assert.deepEqual(next.baseScales, round.scales);
  const nextSettings = { ...parameters, candidateScales: next.baseScales };
  for (const move of next.moves) {
    assert.equal(move.previous, round.positions[move.candidate]);
    assert.equal(move.position, H.bestResponse(points, round.positions, nextSettings, move.candidate).position);
  }
});
test("les paramètres k_max et les coûts invalides sont rejetés", () => {
  for (const kMax of [-1, NaN, Infinity]) {
    assert.throws(() => H.distribution({ ...settings, kMax }), /k_max/);
  }
  for (const candidateScales of [[1], [1, 0], [1, NaN], "incorrect"]) {
    assert.throws(() => H.evaluate([], [0, 1], { ...settings, candidateScales }));
  }
  for (const previousScales of [null, [1], [0, 1], [NaN, 1], [Infinity, 1]]) {
    assert.throws(() => H.runRound([], [0, 1], settings, previousScales), /coûts précédents/);
  }
});
test("le bruit gaussien additif est reproductible, centré et d’écart-type 0,1", () => {
  const parameters = { ...settings, noiseSigma: 0.1 };
  const points = H.distribution(parameters, 10000);
  const noisy = H.noisePoints(points, [-0.5, 0.5], parameters, 12345);
  assert.deepEqual(noisy, H.noisePoints(points, [-0.5, 0.5], parameters, 12345));
  assert.notDeepEqual(noisy, H.noisePoints(points, [-0.5, 0.5], parameters, 54321));
  const errors = noisy.flatMap(point => point.costShocks);
  const mean = errors.reduce((sum, error) => sum + error, 0) / errors.length;
  const deviation = Math.sqrt(errors.reduce((sum, error) => sum + (error - mean) ** 2, 0) / errors.length);
  near(mean, 0, 0.002);
  near(deviation, 0.1, 0.002);
  assert.ok(points.every(point => point.costShocks === undefined));
  const noiseless = H.noisePoints(points, [-0.5, 0.5], { ...settings, noiseSigma: 0 }, 12345);
  assert.deepEqual(H.evaluate(noiseless, [-0.5, 0.5], settings), H.evaluate(points, [-0.5, 0.5], settings));
});
test("le bruit modifie le softmax et le seuil sur le coût spatial", () => {
  const points = [{ x: 0, mass: 1, density: 1, costShocks: [0.1, -0.1] }];
  const result = H.evaluate(points, [-1, 1], settings, true);
  near(result.votes[0], 1 / (1 + Math.exp(0.2)));
  assert.deepEqual(H.evaluate(points, [-1, 1], { ...settings, kMax: 2 }).votes, [0, 1]);
  near(H.evaluate(points, [0, 0], settings).votes[0], 1 / (1 + Math.exp(0.2)));
});
test("un choc négatif borne le coût total à zéro dans le vote et l’optimisation", () => {
  const points = [{ x: 0, mass: 1, costShocks: [-3, 0] }], positions = [-1, 1];
  const parameters = { ...settings, kMax: 0 };
  const result = H.evaluate(points, positions, parameters, true);
  assert.deepEqual(result.votes, [1, 0]);
  near(result.totalCost, 0);
  near(result.assignments[0].cost, 0);
  const response = H.bestResponse(points, positions, parameters, 0);
  near(response.before, 1);
  near(response.after, 1);
  near(response.position, -1);
});
test("un seul tirage sert à toutes les décisions et au vote réalisé d’un tour", () => {
  const parameters = { ...settings, noiseSigma: 0.05, noiseSeed: 12345, kMax: 1.6 };
  const points = H.distribution(parameters, 40);
  const positions = [-0.7, 0.5];
  const round = H.runRound(points, positions, parameters);
  assert.deepEqual(round, H.runRound(points, positions, parameters));
  const noisy = H.noisePoints(points, positions, parameters, round.noiseSeed);
  for (const move of round.moves) {
    const response = H.bestResponse(noisy, positions, parameters, move.candidate);
    near(move.position, response.position);
    near(move.before, response.before);
    near(move.after, response.after);
  }
  assert.deepEqual(round.votes, H.evaluate(noisy, round.positions, parameters).votes);
  const next = H.runRound(points, round.positions, { ...parameters, noiseSeed: 54321 });
  assert.notEqual(round.noiseSeed, next.noiseSeed);
});
test("les paramètres de bruit et chocs invalides sont signalés", () => {
  for (const noiseSigma of [-1, NaN, Infinity]) {
    assert.throws(() => H.distribution({ ...settings, noiseSigma }), /bruit/);
  }
  for (const seed of [-1, 0.5, NaN, 0x100000000]) {
    assert.throws(() => H.noisePoints([], [-1, 1], settings, seed), /Graine/);
  }
  for (const costShocks of [[0], [0, Infinity], [0, NaN], "incorrect"]) {
    assert.throws(() => H.evaluate([{ x: 0, mass: 1, costShocks }], [-1, 1], settings), /chocs/);
  }
});
test("le succès pondère les trois derniers scores par 3, 2, 1 et renormalise au démarrage", () => {
  const history = [[0.8, 0.2], [0.6, 0.4], [0.3, 0.7]];
  const result = H.successCosts([2, 3], history, settings.eta);
  const expected = (3 * 0.3 + 2 * 0.6 + 0.8) / 6;
  near(result.success[0], expected);
  near(result.success[1], 1 - expected);
  near(result.scales[0], 2 * Math.exp(0.5 - expected));
  assert.ok(result.scales[0] > 2);
  assert.ok(result.scales[1] < 3);
  near(H.successCosts([1, 1], history.slice(0, 1), settings.eta).success[0], 0.8);
  near(H.successCosts([1, 1], history.slice(0, 2), settings.eta).success[0], (3 * 0.6 + 2 * 0.8) / 5);
  assert.deepEqual(H.successCosts([2, 3], [[0.5, 0.5]], settings.eta).scales, [2, 3]);
  assert.deepEqual(history, [[0.8, 0.2], [0.6, 0.4], [0.3, 0.7]]);
});
test("les coûts sont actualisés avant les décisions, puis seuls les votes réalisés alimentent la mémoire", () => {
  const parameters = { ...settings, eta: 0.1, noiseSigma: 0.05, noiseSeed: 42, kMax: 1.7 };
  const points = H.distribution(parameters, 30), positions = [-0.8, 0.3];
  const history = [[0.8, 0.2], [0.7, 0.3], [0.6, 0.4]], scales = [1.2, 0.9];
  const expected = H.successCosts(scales, history, parameters.eta);
  const round = H.runRound(points, positions, parameters, scales, history);
  assert.deepEqual(round.baseScales, expected.scales);
  assert.deepEqual(round.scales, expected.scales);
  assert.deepEqual(round.success, expected.success);
  const noisy = H.noisePoints(points, positions, parameters, 42);
  const frozen = { ...parameters, candidateScales: expected.scales };
  for (const move of round.moves) {
    const response = H.bestResponse(noisy, positions, frozen, move.candidate);
    near(move.position, response.position);
    near(move.before, response.before);
    near(move.after, response.after);
  }
  const votes = H.evaluate(noisy, round.positions, frozen);
  assert.deepEqual(round.votes, votes.votes);
  assert.deepEqual(round.shareHistory, [...history.slice(1), H.expressedShares(votes)]);
  assert.deepEqual(scales, [1.2, 0.9]);
  assert.deepEqual(history, [[0.8, 0.2], [0.7, 0.3], [0.6, 0.4]]);
  const saved = JSON.parse(JSON.stringify(round));
  const next = H.runRound(points, saved.positions, parameters, saved.scales, saved.shareHistory);
  assert.deepEqual(next, H.runRound(points, round.positions, parameters, round.scales, round.shareHistory));
  assert.deepEqual(next.baseScales, H.successCosts(round.scales, round.shareHistory, parameters.eta).scales);
});
test("les parts des exprimés ignorent l’abstention et sont nulles sans participation", () => {
  const shares = H.expressedShares({ votes: [0.1, 0.3], turnout: 0.4 });
  near(shares[0], 0.25);
  near(shares[1], 0.75);
  assert.deepEqual(H.expressedShares({ votes: [0, 0], turnout: 0 }), [0, 0]);
  const result = H.successCosts([1, 1], [[0, 0]], settings.eta);
  result.scales.forEach(k => near(k, Math.exp(0.5)));
  const round = H.runRound([], [-1, 1], { ...settings, noiseSeed: 1 }, [1, 1], [[0, 0]]);
  assert.deepEqual(round.shares, [0, 0]);
  assert.deepEqual(round.shareHistory, [[0, 0], [0, 0]]);
});
test("une optimisation individuelle actualise tous les coûts mais une seule position", () => {
  const parameters = { ...settings, eta: 0.1, noiseSeed: 1 };
  const positions = [-0.8, 0.6], history = [[0.7, 0.3]];
  const round = H.runRound(H.distribution(parameters, 20), positions, parameters, [1, 1], history, [0]);
  assert.deepEqual(round.order, [0]);
  assert.equal(round.positions[1], positions[1]);
  assert.deepEqual(round.scales, H.successCosts([1, 1], history, parameters.eta).scales);
  assert.equal(round.shareHistory.length, 2);
});
test("les historiques invalides et le dépassement numérique des coûts sont signalés", () => {
  for (const history of [null, [[1]], [[NaN, 0]], [[-0.1, 1]], [[0.8, 0.8]], Array(4).fill([0.5, 0.5])]) {
    assert.throws(() => H.successCosts([1, 1], history, settings.eta), /historique/);
  }
  assert.throws(() => H.successCosts([Number.MAX_VALUE, 1], [[0, 1]], settings.eta), /numériques/);
});
test("eta règle l’intensité de la réputation sans modifier la mesure du succès", () => {
  const scales = [2, 3], history = [[0.8, 0.2]];
  const mild = H.successCosts(scales, history, 0.1);
  const strong = H.successCosts(scales, history, 1);
  near(mild.scales[0], 2 * Math.exp(-0.03));
  near(mild.scales[1], 3 * Math.exp(0.03));
  near(strong.scales[0], 2 * Math.exp(-0.3));
  near(strong.scales[1], 3 * Math.exp(0.3));
  assert.deepEqual(mild.success, strong.success);
  assert.ok(strong.scales[0] < mild.scales[0] && mild.scales[0] < scales[0]);
  assert.ok(strong.scales[1] > mild.scales[1] && mild.scales[1] > scales[1]);
});
test("eta nul conserve les coûts de tour en tour tout en actualisant la mémoire", () => {
  const parameters = { ...settings, eta: 0, gamma: 0.1, noiseSeed: 42 };
  const points = H.distribution(parameters, 20), scales = [1.2, 0.8];
  let positions = [-0.8, 0.6], history = [[0.7, 0.3]];
  for (let t = 0; t < 5; t++) {
    const round = H.runRound(points, positions, parameters, scales, history);
    assert.deepEqual(round.baseScales, scales);
    assert.deepEqual(round.scales, scales);
    assert.deepEqual(round.shareHistory, [...history.slice(-2), round.shares]);
    positions = round.positions;
    history = round.shareHistory;
  }
});
test("eta invalide et les dépassements numériques de réputation sont signalés", () => {
  for (const eta of [-0.1, NaN, Infinity, undefined]) {
    assert.throws(() => H.distribution({ ...settings, eta }));
    assert.throws(() => H.successCosts([1, 1], [[0.8, 0.2]], eta), /réputation/);
  }
  assert.throws(() => H.successCosts([1, 1], [[0.8, 0.2]], 10000), /numériques/);
});
test("gamma borne la meilleure réponse même si une position plus éloignée rapporte davantage", () => {
  const points = [{ x: 0.8, mass: 1, density: 1 }], positions = [-0.6, -1];
  const parameters = { ...settings, gamma: 0.1 };
  const response = H.bestResponse(points, positions, parameters, 0);
  near(response.position, -0.5);
  assert.ok(response.displacement <= parameters.gamma + 1e-12);
  assert.ok(H.bestResponse(points, positions, settings, 0).after > response.after);
  for (let j = 0; j <= 200; j++) {
    const position = -1 + 2 * j / 200;
    if (position < -0.7 || position > -0.5) continue;
    assert.ok(H.evaluate(points, [position, -1], parameters).votes[0] <= response.after + 1e-10);
  }
});
test("les bornes accessibles hors grille et les extrémités de l’axe sont testées", () => {
  for (const sign of [-1, 1]) {
    const points = [{ x: sign, mass: 1, density: 1 }];
    const narrow = H.bestResponse(points, [sign * 0.123, -sign], { ...settings, gamma: 0.003 }, 0);
    near(narrow.position, sign * 0.126);
    const edge = H.bestResponse(points, [sign * 0.97, -sign], { ...settings, gamma: 0.1 }, 0);
    near(edge.position, sign);
    assert.ok(edge.position >= -1 && edge.position <= 1);
  }
});
test("gamma nul fige les positions sans bloquer la réputation ni les scores", () => {
  const parameters = { ...settings, gamma: 0, noiseSeed: 42 };
  const positions = [-0.8, 0.4], history = [[0.8, 0.2]];
  const round = H.runRound(H.distribution(parameters, 20), positions, parameters, [1, 1], history);
  assert.deepEqual(round.positions, positions);
  assert.deepEqual(round.scales, H.successCosts([1, 1], history, parameters.eta).scales);
  assert.notDeepEqual(round.scales, [1, 1]);
  assert.equal(round.shareHistory.length, 2);
  round.moves.forEach(move => { assert.equal(move.displacement, 0); near(move.gain, 0); });
});
test("les candidats en place respectent gamma pendant les tours successifs", () => {
  const parameters = { ...settings, gamma: 0.1, noiseSigma: 0.05, noiseSeed: 42, kMax: 2 };
  const points = H.distribution(parameters, 20);
  let positions = [-0.95, -0.4, 0.3, 0.95], scales = [1, 1, 1, 1], history = [[0.4, 0.3, 0.2, 0.1]];
  let state = { noiseSeed: 42 };
  for (let t = 0; t < 10; t++) {
    const round = H.runRound(points, positions, parameters, scales, history, [0, 1, 2, 3], state);
    round.positions.forEach((position, i) => {
      if (!round.moves[i].entry) assert.ok(Math.abs(position - positions[i]) <= 0.1 + 1e-12);
      assert.ok(position >= -1 && position <= 1);
    });
    positions = round.positions;
    scales = round.scales;
    history = round.shareHistory;
    state = round;
  }
});
test("un entrant couvre les abstentionnistes, avec coût 1 et sans mémoire héritée", () => {
  const parameters = { ...settings, gamma: 0, eta: 0.4, scale: 2, beta: 2, kMax: 1.2, noiseSeed: 42 };
  const points = [{ x: -0.8, mass: 0.6 }, { x: 0.8, mass: 0.3 }, { x: 0, mass: 0.1 }];
  const history = [[1, 0], [1, 0], [1, 0]];
  const round = H.runRound(points, [0, 0.2], parameters, [0.1, 3], history);
  assert.equal(round.entries.length, 1);
  assert.equal(round.entries[0].candidate, 1);
  assert.ok(Math.abs(round.positions[1] + 0.8) <= 0.1 + 1e-12);
  near(round.entries[0].recruitmentMass, 0.6);
  assert.equal(round.positions[0], 0);
  assert.equal(round.scales[1], 1);
  assert.equal(round.success[1], 0.5);
  assert.ok(round.moves[1].entry && round.moves[1].displacement > parameters.gamma);
  assert.deepEqual(round.historyLengths, [3, 1]);
  const next = H.successCosts(round.scales, round.shareHistory, parameters.eta, round.historyLengths);
  near(next.success[1], round.shares[1]);
  near(next.success[0], (3 * round.shares[0] + 2 + 1) / 6);
  const secondHistory = [...round.shareHistory.slice(-2), [0.2, 0.8]];
  const second = H.successCosts(round.scales, secondHistory, parameters.eta, [3, 2]);
  near(second.success[1], (3 * 0.8 + 2 * round.shares[1]) / 5);
  assert.deepEqual(history, [[1, 0], [1, 0], [1, 0]]);
  assert.deepEqual(round, H.runRound(points, [0, 0.2], parameters, [0.1, 3], history));
});
test("l’entrée maximise la masse accessible, pas la densité ponctuelle ni le seul gain de voix", () => {
  const points = [{ x: -0.8, mass: 0.4 }, { x: 0.65, mass: 0.25 }, { x: 0.85, mass: 0.25 }, { x: 0, mass: 0.1 }];
  const parameters = { ...settings, gamma: 0, eta: 0, beta: 2, kMax: 1.3, noiseSeed: 42 };
  const round = H.runRound(points, [0, -0.8], parameters, [0.1, 3], [[1, 0]]);
  near(round.entries[0].recruitmentMass, 0.5);
  assert.ok(round.positions[1] >= 0.7 - 1e-12 && round.positions[1] <= 0.8 + 1e-12);
});
test("le renouvellement utilise le dernier vote bruité et conserve son état après sérialisation", () => {
  const parameters = { ...settings, eta: 0.1, beta: 2, kMax: 1.2, noiseSigma: 0.1, noiseSeed: 456 };
  const positions = [0, 0.4], scales = [0.1, 5], points = H.distribution(parameters, 30);
  const previous = H.evaluate(H.noisePoints(points, positions, parameters, 123), positions,
    { ...parameters, candidateScales: scales }, true);
  const history = [H.expressedShares(previous)];
  const round = H.runRound(points, positions, parameters, scales, history, [0, 1], { noiseSeed: 123 });
  assert.equal(round.entries.length, 1);
  const nextNoise = H.noisePoints(points, positions, parameters, parameters.noiseSeed);
  const reachable = position => previous.assignments.reduce((sum, point, j) =>
    sum + (point.winners.length === 0 &&
      Math.max(0, 1 + parameters.beta * Math.abs(point.x - position) ** parameters.alpha + nextNoise[j].costShocks[1]) <= parameters.kMax ?
      point.mass : 0), 0);
  near(round.entries[0].recruitmentMass, reachable(round.positions[1]));
  near(round.entries[0].recruitmentMass, Math.max(...Array.from({ length: 201 }, (_, j) => reachable(-1 + j / 100))));
  const saved = JSON.parse(JSON.stringify(round));
  assert.deepEqual(H.runRound(points, saved.positions, parameters, saved.scales, saved.shareHistory, [0, 1], saved),
    H.runRound(points, round.positions, parameters, round.scales, round.shareHistory, [0, 1], round));
  assert.throws(() => H.runRound(points, positions, parameters, scales, history), /graine du vote précédent/);
});
test("les entrées sont reportées sans abstention et une optimisation individuelle reste ciblée", () => {
  const parameters = { ...settings, eta: 0, gamma: 0, kMax: 1.2, noiseSeed: 42 };
  const points = [{ x: 0, mass: 1 }];
  const deferred = H.runRound(points, [0, 0.2], parameters, [0.1, 3], [[1, 0]]);
  assert.deepEqual(deferred.entries, []);
  assert.deepEqual(deferred.deferredEntries, [1]);
  assert.equal(deferred.scales[1], 3);
  const targeted = H.runRound([{ x: -0.8, mass: 0.8 }, { x: 0, mass: 0.2 }],
    [0, 0.2, 0.3], { ...parameters, beta: 2 }, [0.1, 3, 3], [[1, 0, 0]], [1]);
  assert.deepEqual(targeted.entries.map(entry => entry.candidate), [1]);
  assert.equal(targeted.positions[0], 0);
  assert.equal(targeted.positions[2], 0.3);
  assert.equal(targeted.scales[2], 3);
});
test("une petite part positive, même arrondie à zéro, ne déclenche pas d’entrée", () => {
  const parameters = { ...settings, gamma: 0, eta: 0, noiseSeed: 42 };
  const points = [{ x: 0, mass: 1 }], positions = [0, 0], scales = [1, 10];
  const votes = H.evaluate(points, positions, { ...parameters, candidateScales: scales });
  assert.ok(votes.votes[1] > 0 && votes.votes[1] < 0.0005);
  assert.deepEqual(H.runRound(points, positions, parameters, scales, [H.expressedShares(votes)]).entries, []);
  assert.deepEqual(H.runRound([{ x: 0, mass: 1e-12 }], positions, parameters, [1, 1], [[0, 0]]).entries, []);
});
test("les mémoires individuelles invalides sont rejetées", () => {
  for (const lengths of [null, [1], [1, -1], [1, 2], [1, NaN]]) {
    assert.throws(() => H.successCosts([1, 1], [[0.5, 0.5]], 0.1, lengths), /mémoire/);
  }
});
test("une abstention totale peut accueillir plusieurs entrants au même tour", () => {
  const parameters = { ...settings, gamma: 0, eta: 0.4, beta: 2, kMax: 1.3, noiseSeed: 42 };
  const points = [{ x: -0.8, mass: 0.1 }, { x: 0.7, mass: 0.45 }, { x: 0.8, mass: 0.45 }];
  const round = H.runRound(points, [-0.5, 0.5], parameters, [3, 4], [[0, 0]]);
  assert.deepEqual(round.entries.map(entry => entry.candidate), [0, 1]);
  assert.deepEqual(round.scales, [1, 1]);
  assert.deepEqual(round.success, [0.5, 0.5]);
  assert.deepEqual(round.historyLengths, [1, 1]);
  assert.ok(round.moves.every(move => move.entry));
  round.entries.forEach(entry => near(entry.recruitmentMass, 0.9));
  near(round.turnout, 0.9);
});

test("les nouvelles générations changent de teinte avec un texte lisible", () => {
  const P = require("./party-style.js");
  for (let candidate = 0; candidate < 7; candidate++) {
    let previous;
    for (let generation = 0; generation < 40; generation++) {
      const fill = P.color(candidate, generation);
      assert.notEqual(fill, previous);
      assert.equal(fill, P.color(candidate, generation));
      const rgb = [1, 3, 5].map(offset => {
        const c = parseInt(fill.slice(offset, offset + 2), 16) / 255;
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      });
      const luminance = rgb.reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
      const contrast = P.textColor(fill) === "white" ? 1.05 / (luminance + 0.05) : (luminance + 0.05) / 0.05;
      assert.ok(contrast >= 4.5);
      previous = fill;
    }
  }
  assert.throws(() => P.color(0, -1), /Identité/);
});

test("les générations et segments suivent les seules entrées, y compris après poursuite et export", () => {
  const P = require("./party-style.js");
  const initial = [2, 0];
  const rounds = [
    { positions: [-1, 1], entries: [] },
    { positions: [1, -1], entries: [{ candidate: 0 }] },
    { entries: [{ candidate: 1 }] },
    { entries: [{ candidate: 0 }, { candidate: 1 }] }
  ];
  const timeline = P.timeline(initial, rounds);
  assert.deepEqual(timeline, [[2, 0], [2, 0], [3, 0], [3, 1], [4, 2]]);
  assert.deepEqual(initial, [2, 0]);
  assert.deepEqual(P.segments(timeline, 0), [
    { start: 0, end: 1, generation: 2 },
    { start: 2, end: 3, generation: 3 },
    { start: 4, end: 4, generation: 4 }
  ]);
  const archived = JSON.parse(JSON.stringify({ initialPartyGenerations: initial, rounds }));
  assert.deepEqual(P.timeline(archived.initialPartyGenerations, archived.rounds), timeline);
  assert.deepEqual(P.timeline([0, 0], [{}, { entries: [{ candidate: 1 }] }]), [[0, 0], [0, 0], [0, 1]]);
  assert.deepEqual(P.next(timeline.at(-1), [{ candidate: 0 }]), [5, 2]);
});
