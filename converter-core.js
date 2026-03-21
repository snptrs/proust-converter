// ─── Data ────────────────────────────────────────────────────────────────────

const VOLUMES = {
  1: "Du côté de chez Swann (Swann's Way)",
  2: "À l'ombre des jeunes filles en fleurs (Within a Budding Grove)",
  3: "Le Côté de Guermantes (The Guermantes Way)",
  4: "Sodome et Gomorrhe (Sodom and Gomorrah)",
  5: "La Prisonnière (The Captive / The Prisoner)",
  6: "Albertine disparue (The Fugitive)",
  7: "Le Temps retrouvé (Time Regained / Finding Time Again)",
};

const EDITIONS = {
  1: {
    pleiade: "Pléiade vol. 1 (Gallimard, pp. 3–420)",
    sw_v1: "Swann's Way — Vintage (earlier typesetting)",
    sw_v2: "Swann's Way — Vintage (later typesetting)",
    sw_ml: "Swann's Way — Modern Library",
    wbs_pen: "The Way by Swann's — Penguin",
    centaur: "Centaur Edition (pp. 4–398)",
  },
  2: {
    pleiade1: "Pléiade vol. 1 (pp. 423–630, 'Autour de Mme Swann')",
    pleiade2: "Pléiade vol. 2 (pp. 3–306, 'Noms de Pays: le Pays')",
    bg_v: "Within a Budding Grove — Vintage",
    bg_ml: "Within a Budding Grove — Modern Library",
    syg_pen: "In the Shadow of Young Girls in Flower — Penguin",
    centaur: "Centaur Edition (pp. 398–859)",
  },
  3: {
    pleiade: "Pléiade vol. 2 (pp. 309–884)",
    gw_v: "The Guermantes Way — Vintage",
    gw_ml: "The Guermantes Way — Modern Library",
    gw_pen: "The Guermantes Way — Penguin",
    centaur: "Centaur Edition (pp. 861–1372.5)",
  },
  4: {
    pleiade: "Pléiade vol. 3 (pp. 3–515)",
    sg_v: "Sodom and Gomorrah — Vintage",
    sg_ml: "Sodom and Gomorrah — Modern Library",
    sg_pen: "Sodom and Gomorrah — Penguin",
    centaur: "Centaur Edition (pp. 1374–1821)",
  },
  5: {
    pleiade: "Pléiade vol. 3 (pp. 519–915)",
    c_v: "The Captive — Vintage",
    c_ml: "The Captive — Modern Library",
    p_pen: "The Prisoner — Penguin",
    centaur: "Centaur Edition (pp. 1823–2164)",
  },
  6: {
    pleiade: "Pléiade vol. 4 (pp. 3.5–272.5)",
    f_v: "The Fugitive — Vintage",
    f_ml: "The Fugitive — Modern Library",
    f_pen: "The Fugitive — Penguin",
    centaur: "Centaur Edition (pp. 2166–2397)",
  },
  7: {
    pleiade: "Pléiade vol. 4 (pp. 275–625)",
    tr_v: "Time Regained — Vintage",
    tr_ml: "Time Regained — Modern Library",
    fta_pen: "Finding Time Again — Penguin",
    centaur: "Centaur Edition (pp. 2399–2671)",
  },
};

// Conversion coefficients: C[vol][`${from},${to}`] = [slope, intercept]
const C = {};

C[1] = {
  "pleiade,sw_v1": [1.233573387, -3.335479132],
  "sw_v1,pleiade": [0.810639933, 2.706691064],
  "pleiade,sw_ml": [1.46247247, -4.884232786],
  "sw_ml,pleiade": [0.683593503, 3.382665832],
  "sw_v1,wbs_pen": [0.828623582, 3.702518667],
  "wbs_pen,sw_v1": [1.206724292, -4.443495398],
  "sw_v1,centaur": [0.76779357, 3.702145356],
  "centaur,sw_v1": [1.302394851, -4.814921915],
  "sw_v1,sw_v2": [0.986807317, 1.738221519],
  "sw_v2,sw_v1": [1.013352293, -1.756590505],
  "sw_v1,sw_ml": [1.18077393, -0.640517196],
  "sw_ml,sw_v1": [0.846890326, 0.545130798],
};

C[2] = {
  "pleiade1,bg_v": [1.21101759, -511.257662172],
  "bg_v,pleiade1": [0.825707801, 422.176750305],
  "pleiade2,bg_v": [1.202361172, 249.490559457],
  "bg_v,pleiade2": [0.831678264, -207.492450828],
  "pleiade1,bg_ml": [1.435895539, -606.419946612],
  "bg_ml,pleiade1": [0.696416162, 422.330677685],
  "pleiade2,bg_ml": [1.419641482, 294.658409242],
  "bg_ml,pleiade2": [0.704389803, -207.550977624],
  "bg_v,bg_ml": [1.179081956, 0.396704579],
  "bg_ml,bg_v": [0.848115553, -0.335884534],
  "bg_v,syg_pen": [0.855012927, 3.847380346],
  "syg_pen,bg_v": [1.169553731, -4.494902397],
  "bg_v,centaur": [0.748723769, 397.408867926],
  "centaur,bg_v": [1.335594388, -530.774474891],
};

C[3] = {
  "pleiade,gw_v": [1.198275864, -369.89383029],
  "gw_v,pleiade": [0.834523891, 308.690037321],
  "gw_v,gw_ml": [1.186816395, -0.694291592],
  "gw_ml,gw_v": [0.842589759, 0.585222698],
  "pleiade,gw_ml": [1.4221334411279902, -439.6903537895196],
  "gw_ml,pleiade": [0.7031612841974323, 309.17841964403647],
  "gw_v,gw_pen": [0.856174616, 4.121424793],
  "gw_pen,gw_v": [1.167947339, -4.802029433],
  "gw_v,centaur": [0.741944615, 861.975120788],
  "centaur,gw_v": [1.347670562, -1161.625262229],
};

C[4] = {
  "pleiade,sg_v": [1.197055715, -2.955220968],
  "sg_v,pleiade": [0.835358484, 2.475701662],
  "pleiade,sg_ml": [1.407654847, -4.059335364],
  "sg_ml,pleiade": [0.710360991, 2.895929366],
  "sg_v,sg_ml": [1.178828766, -1.360028011],
  "sg_ml,sg_v": [0.848297696, 1.15414097],
  "sg_v,sg_pen": [0.842166475, 4.953554713],
  "sg_pen,sg_v": [1.187374703, -5.872114601],
  "sg_v,centaur": [0.728056721, 1374.314705353],
  "centaur,sg_v": [1.373467345, -1887.565440587],
};

C[5] = {
  "pleiade,c_v": [1.192905065, -618.209458662],
  "c_v,pleiade": [0.838227707, 518.250447031],
  "pleiade,c_ml": [1.406069526, -728.78695778],
  "c_ml,pleiade": [0.711156645, 518.324704835],
  "c_v,c_ml": [1.177461827, 0.036966241],
  "c_ml,c_v": [0.849280259, -0.03081969],
  "c_v,p_pen": [0.80618565, 1.945170957],
  "p_pen,c_v": [1.240384038, -2.40989792],
  "c_v,centaur": [0.721765807, 1823.521616602],
  "centaur,c_v": [1.385356813, -2526.210734481],
};

C[6] = {
  "pleiade,f_v": [1.195334858, 473.687883951],
  "f_v,pleiade": [0.83650952, -396.236787664],
  "pleiade,f_ml": [1.404696897, 559.085410799],
  "f_ml,pleiade": [0.711859283, -397.985166807],
  "f_v,f_ml": [1.174098975, 3.089534071],
  "f_ml,f_v": [0.851695121, -2.616831953],
  "f_v,f_pen": [0.850169915, -19.4004372],
  "f_pen,f_v": [1.176084092, 22.897128459],
  "f_v,centaur": [0.714404279, 1827.733593807],
  "centaur,f_v": [1.398793103, -2556.171836926],
};

C[7] = {
  "pleiade,tr_v": [1.265842183, -343.82146135],
  "tr_v,pleiade": [0.789735306, 271.670253424],
  "pleiade,tr_ml": [1.519275653, -419.407604953],
  "tr_ml,pleiade": [0.65794072, 276.148807423],
  "tr_v,tr_ml": [1.176930358, 0.398227648],
  "tr_ml,tr_v": [0.849661579, -0.335925468],
  "pleiade,fta_pen": [1.011807631, -275.490599286],
  "fta_pen,pleiade": [0.988312077, 272.278638271],
  "tr_v,centaur": [0.620399992, 2394.651714476],
  "centaur,tr_v": [1.611363479, -3858.585570265],
};

// ─── Conversion Logic ────────────────────────────────────────────────────────

function findPath(vol, src, dst) {
  if (src === dst) return [src];
  const conv = C[vol];
  if (!conv) return [];
  const visited = new Set([src]);
  const queue = [[src]];
  while (queue.length) {
    const path = queue.shift();
    const current = path[path.length - 1];
    for (const key of Object.keys(conv)) {
      const [a, b] = key.split(",");
      if (a === current && !visited.has(b)) {
        const newPath = [...path, b];
        if (b === dst) return newPath;
        visited.add(b);
        queue.push(newPath);
      }
    }
  }
  return [];
}

function convertPage(vol, page, src, dst) {
  const path = findPath(vol, src, dst);
  if (!path.length) return NaN;
  let result = page;
  for (let i = 0; i < path.length - 1; i++) {
    const [slope, intercept] = C[vol][`${path[i]},${path[i + 1]}`];
    result = slope * result + intercept;
  }
  return result;
}

// ─── Export for Node.js / keep globals for browser ───────────────────────────

if (typeof module !== "undefined" && module.exports) {
  module.exports = { VOLUMES, EDITIONS, C, findPath, convertPage };
}
