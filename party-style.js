(function (root) {
  "use strict";
  const colors = ["#fe0000", "#f15f24", "#feb616", "#ffe500", "#91b43e", "#4aa44a", "#01742f"];
  function color(candidate, generation = 0) {
    if (!Number.isInteger(candidate) || candidate < 0 || candidate >= colors.length ||
        !Number.isSafeInteger(generation) || generation < 0) {
      throw new Error("Identité de parti invalide.");
    }
    if (generation === 0) return colors[candidate];
    let fraction = 0, weight = 0.5;
    for (let n = generation; n > 0; n = Math.floor(n / 2)) {
      fraction += (n % 2) * weight;
      weight /= 2;
    }
    const rgb = [1, 3, 5].map(offset => parseInt(colors[candidate].slice(offset, offset + 2), 16) / 255);
    const maximum = Math.max(...rgb), minimum = Math.min(...rgb), delta = maximum - minimum;
    let hue = 0;
    if (delta) {
      if (maximum === rgb[0]) hue = ((rgb[1] - rgb[2]) / delta + 6) % 6;
      else if (maximum === rgb[1]) hue = (rgb[2] - rgb[0]) / delta + 2;
      else hue = (rgb[0] - rgb[1]) / delta + 4;
    }
    const lightness = delta === 0 ? 0.48 + fraction * 0.32 :
      generation % 2 ? 0.62 + 0.08 * fraction : 0.36 + 0.1 * fraction;
    const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(maximum + minimum - 1));
    const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
    const secondary = chroma * (1 - Math.abs(hue % 2 - 1));
    const sector = [[chroma, secondary, 0], [secondary, chroma, 0], [0, chroma, secondary],
      [0, secondary, chroma], [secondary, 0, chroma], [chroma, 0, secondary]][Math.floor(hue)];
    return "#" + sector.map(value => Math.round(255 * (value + lightness - chroma / 2))
      .toString(16).padStart(2, "0")).join("");
  }
  function textColor(fill) {
    const rgb = [1, 3, 5].map(offset => {
      const value = parseInt(fill.slice(offset, offset + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    const luminance = rgb.reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
    return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "black" : "white";
  }
  function next(generations, entries = []) {
    const result = [...generations];
    for (const entry of entries) {
      if (!Number.isInteger(entry.candidate) || entry.candidate < 0 || entry.candidate >= result.length) {
        throw new Error("Place de renouvellement invalide.");
      }
      result[entry.candidate]++;
    }
    result.forEach((generation, candidate) => color(candidate, generation));
    return result;
  }
  function timeline(initial, rounds) {
    const result = [[...initial]];
    for (const round of rounds) result.push(next(result[result.length - 1], round.entries));
    return result;
  }
  function segments(generations, candidate) {
    const result = [];
    generations.forEach((sample, t) => {
      const previous = result[result.length - 1];
      if (previous && previous.generation === sample[candidate]) previous.end = t;
      else result.push({ start: t, end: t, generation: sample[candidate] });
    });
    return result;
  }
  const api = { colors, color, textColor, next, timeline, segments };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.PartyStyle = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
