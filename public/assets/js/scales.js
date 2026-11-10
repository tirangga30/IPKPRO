(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.IPKApp = root.IPKApp || {};
    root.IPKApp.Scales = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PRESET_SCALES = [
    {
      id: 'plus_minus',
      name: 'Standar Plus-Minus',
      description: 'Umum dipakai PTN & PTS (A, A-, B+, B, B-, C+, C, D, E)',
      grades: [
        { letter: 'A', weight: 4.0, minScore: 85 },
        { letter: 'A-', weight: 3.7, minScore: 80 },
        { letter: 'B+', weight: 3.3, minScore: 75 },
        { letter: 'B', weight: 3.0, minScore: 70 },
        { letter: 'B-', weight: 2.7, minScore: 65 },
        { letter: 'C+', weight: 2.3, minScore: 60 },
        { letter: 'C', weight: 2.0, minScore: 55 },
        { letter: 'D', weight: 1.0, minScore: 40 },
        { letter: 'E', weight: 0.0, minScore: 0 }
      ]
    },
    {
      id: 'ab_bc',
      name: 'Skala AB / BC',
      description: 'Model ITB, ITS, Telkom & politeknik (A, AB, B, BC, C, D, E)',
      grades: [
        { letter: 'A', weight: 4.0, minScore: 80 },
        { letter: 'AB', weight: 3.5, minScore: 73 },
        { letter: 'B', weight: 3.0, minScore: 65 },
        { letter: 'BC', weight: 2.5, minScore: 60 },
        { letter: 'C', weight: 2.0, minScore: 50 },
        { letter: 'D', weight: 1.0, minScore: 40 },
        { letter: 'E', weight: 0.0, minScore: 0 }
      ]
    },
    {
      id: 'quarter',
      name: 'Skala Kelipatan 0.25',
      description: 'A- bernilai 3.75 dan B+ bernilai 3.50 (A, A-, B+, B, ...)',
      grades: [
        { letter: 'A', weight: 4.0, minScore: 85 },
        { letter: 'A-', weight: 3.75, minScore: 80 },
        { letter: 'B+', weight: 3.5, minScore: 75 },
        { letter: 'B', weight: 3.0, minScore: 70 },
        { letter: 'B-', weight: 2.75, minScore: 65 },
        { letter: 'C+', weight: 2.5, minScore: 60 },
        { letter: 'C', weight: 2.0, minScore: 55 },
        { letter: 'D', weight: 1.0, minScore: 40 },
        { letter: 'E', weight: 0.0, minScore: 0 }
      ]
    },
    {
      id: 'classic',
      name: 'Skala Klasik (5 Huruf)',
      description: 'Penilaian 5 huruf tanpa plus/minus (A, B, C, D, E)',
      grades: [
        { letter: 'A', weight: 4.0, minScore: 80 },
        { letter: 'B', weight: 3.0, minScore: 70 },
        { letter: 'C', weight: 2.0, minScore: 56 },
        { letter: 'D', weight: 1.0, minScore: 40 },
        { letter: 'E', weight: 0.0, minScore: 0 }
      ]
    }
  ];

  function cloneScale(scale) {
    return {
      id: String(scale.id || 'custom'),
      name: String(scale.name || 'Skala Kustom'),
      description: String(scale.description || ''),
      grades: sortScaleGrades(
        (scale.grades || []).map(function (g) {
          return {
            letter: String(g.letter || '').trim(),
            weight: Number(g.weight) || 0,
            minScore: Number(g.minScore) || 0
          };
        })
      )
    };
  }

  function getDefaultScale() {
    return cloneScale(PRESET_SCALES[0]);
  }

  function getPresetById(id) {
    for (var i = 0; i < PRESET_SCALES.length; i++) {
      if (PRESET_SCALES[i].id === id) {
        return cloneScale(PRESET_SCALES[i]);
      }
    }
    return null;
  }

  function sortScaleGrades(grades) {
    return grades.slice().sort(function (a, b) {
      if (b.weight !== a.weight) {
        return b.weight - a.weight;
      }
      return b.minScore - a.minScore;
    });
  }

  function getScaleMaxWeight(scale) {
    var grades = (scale && scale.grades) || [];
    var max = 0;
    for (var i = 0; i < grades.length; i++) {
      if (grades[i].weight > max) {
        max = grades[i].weight;
      }
    }
    return max > 0 ? max : 4.0;
  }

  function findGradeEntry(scale, letter) {
    if (!scale || !scale.grades || !letter) return null;
    var target = String(letter).trim().toUpperCase();
    for (var i = 0; i < scale.grades.length; i++) {
      if (String(scale.grades[i].letter).trim().toUpperCase() === target) {
        return scale.grades[i];
      }
    }
    return null;
  }

  function scoreToGrade(scale, numericScore) {
    if (numericScore === '' || numericScore === null || numericScore === undefined) {
      return null;
    }
    var num = Number(numericScore);
    if (!Number.isFinite(num)) return null;
    var clamped = Math.max(0, Math.min(100, num));
    var sorted = (scale && scale.grades ? scale.grades : []).slice().sort(function (a, b) {
      if (b.minScore !== a.minScore) return b.minScore - a.minScore;
      return b.weight - a.weight;
    });
    for (var i = 0; i < sorted.length; i++) {
      if (clamped >= sorted[i].minScore) {
        return sorted[i];
      }
    }
    return sorted.length > 0 ? sorted[sorted.length - 1] : null;
  }

  function getGradeTone(weight, maxWeight) {
    var ratio = maxWeight > 0 ? weight / maxWeight : 0;
    if (ratio >= 0.875) return 'excellent';
    if (ratio >= 0.625) return 'good';
    if (ratio >= 0.45) return 'fair';
    return 'poor';
  }

  function getPredikat(ipk, hasCourses) {
    if (!hasCourses) {
      return { label: 'Belum Ada Nilai', tone: 'neutral' };
    }
    if (ipk >= 3.51) {
      return { label: 'Dengan Pujian (Cum Laude)', tone: 'emerald' };
    }
    if (ipk >= 3.01) {
      return { label: 'Sangat Memuaskan', tone: 'blue' };
    }
    if (ipk >= 2.76) {
      return { label: 'Memuaskan', tone: 'teal' };
    }
    if (ipk >= 2.0) {
      return { label: 'Cukup', tone: 'amber' };
    }
    return { label: 'Perlu Perbaikan', tone: 'rose' };
  }

  function getMaxSksRecommendation(ips) {
    if (ips === null || ips === undefined || !Number.isFinite(ips)) {
      return { maxSks: null, note: 'Tambahkan nilai semester' };
    }
    if (ips >= 3.0) {
      return { maxSks: 24, note: 'Penuh (IPS ≥ 3.00)' };
    }
    if (ips >= 2.5) {
      return { maxSks: 22, note: 'IPS 2.50 – 2.99' };
    }
    if (ips >= 2.0) {
      return { maxSks: 18, note: 'IPS 2.00 – 2.49' };
    }
    return { maxSks: 15, note: 'Batas (IPS < 2.00)' };
  }

  return {
    PRESET_SCALES: PRESET_SCALES,
    cloneScale: cloneScale,
    getDefaultScale: getDefaultScale,
    getPresetById: getPresetById,
    sortScaleGrades: sortScaleGrades,
    getScaleMaxWeight: getScaleMaxWeight,
    findGradeEntry: findGradeEntry,
    scoreToGrade: scoreToGrade,
    getGradeTone: getGradeTone,
    getPredikat: getPredikat,
    getMaxSksRecommendation: getMaxSksRecommendation
  };
});
