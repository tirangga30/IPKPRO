(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var Scales = require('./scales.js');
    module.exports = factory(Scales);
  } else {
    root.IPKApp = root.IPKApp || {};
    root.IPKApp.Calculator = factory(root.IPKApp.Scales);
  }
})(typeof self !== 'undefined' ? self : this, function (Scales) {
  'use strict';

  function roundTo(val, decimals) {
    var factor = Math.pow(10, decimals);
    return Math.round((val + Number.EPSILON) * factor) / factor;
  }

  function getCourseIdentityKey(course) {
    var code = String((course && course.code) || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '');
    if (code) return 'code:' + code;
    var name = String((course && course.name) || '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ');
    if (name) return 'name:' + name;
    return null;
  }

  function resolveCourseBase(course, scale, semIndex, courseIndex) {
    var sksNum = Number(course.sks);
    var validSks = Number.isFinite(sksNum) && sksNum > 0 ? sksNum : 0;
    var rawGrade = String(course.grade || '').trim();
    var gradeEntry = rawGrade ? Scales.findGradeEntry(scale, rawGrade) : null;
    var unknownGrade = Boolean(rawGrade && !gradeEntry);
    var included = course.included !== false;
    var calculable = included && validSks > 0 && gradeEntry !== null;
    var weight = gradeEntry ? Number(gradeEntry.weight) : 0;
    var mutu = calculable ? validSks * weight : 0;

    return {
      id: course.id,
      semIndex: semIndex,
      courseIndex: courseIndex,
      identityKey: getCourseIdentityKey(course),
      included: included,
      validSks: validSks,
      gradeEntry: gradeEntry,
      unknownGrade: unknownGrade,
      calculable: calculable,
      weight: weight,
      mutu: mutu,
      countedInIps: calculable,
      countedInIpk: calculable,
      supersededByIpk: false
    };
  }

  function applyRetakePolicy(flatCourses, retakePolicy) {
    if (retakePolicy !== 'best' && retakePolicy !== 'latest') {
      return;
    }

    var groups = Object.create(null);
    for (var i = 0; i < flatCourses.length; i++) {
      var c = flatCourses[i];
      if (!c.calculable || !c.identityKey) continue;
      if (!groups[c.identityKey]) {
        groups[c.identityKey] = [];
      }
      groups[c.identityKey].push(c);
    }

    var keys = Object.keys(groups);
    for (var k = 0; k < keys.length; k++) {
      var list = groups[keys[k]];
      if (list.length <= 1) continue;

      // Only supersede across different semesters (or duplicate entries)
      var winner = list[0];
      for (var j = 1; j < list.length; j++) {
        var candidate = list[j];
        if (retakePolicy === 'best') {
          if (
            candidate.weight > winner.weight ||
            (candidate.weight === winner.weight &&
              (candidate.semIndex > winner.semIndex ||
                (candidate.semIndex === winner.semIndex && candidate.courseIndex > winner.courseIndex)))
          ) {
            winner = candidate;
          }
        } else if (retakePolicy === 'latest') {
          if (
            candidate.semIndex > winner.semIndex ||
            (candidate.semIndex === winner.semIndex && candidate.courseIndex > winner.courseIndex)
          ) {
            winner = candidate;
          }
        }
      }

      for (var m = 0; m < list.length; m++) {
        if (list[m] !== winner) {
          list[m].countedInIpk = false;
          list[m].supersededByIpk = true;
        }
      }
    }
  }

  function computePrefixIpk(semestersPrefix, scale, retakePolicy) {
    var flat = [];
    for (var s = 0; s < semestersPrefix.length; s++) {
      var courses = semestersPrefix[s].courses || [];
      for (var c = 0; c < courses.length; c++) {
        flat.push(resolveCourseBase(courses[c], scale, s, c));
      }
    }
    applyRetakePolicy(flat, retakePolicy);

    var sks = 0;
    var mutu = 0;
    for (var i = 0; i < flat.length; i++) {
      if (flat[i].countedInIpk) {
        sks += flat[i].validSks;
        mutu += flat[i].mutu;
      }
    }
    return sks > 0 ? mutu / sks : null;
  }

  function calculateAcademicSummary(semesters, scale, retakePolicy) {
    var policy = retakePolicy || 'all';
    var maxWeight = Scales.getScaleMaxWeight(scale);
    var safeSemesters = Array.isArray(semesters) ? semesters : [];

    var flatCourses = [];
    var semesterResolved = [];
    var crossSemesterKeyMap = Object.create(null);

    for (var s = 0; s < safeSemesters.length; s++) {
      var sem = safeSemesters[s];
      var courses = Array.isArray(sem.courses) ? sem.courses : [];
      var resolvedList = [];
      for (var c = 0; c < courses.length; c++) {
        var res = resolveCourseBase(courses[c], scale, s, c);
        flatCourses.push(res);
        resolvedList.push(res);
        if (res.calculable && res.identityKey) {
          if (!crossSemesterKeyMap[res.identityKey]) {
            crossSemesterKeyMap[res.identityKey] = {};
          }
          crossSemesterKeyMap[res.identityKey][s] = true;
        }
      }
      semesterResolved.push(resolvedList);
    }

    var duplicateAcrossSemestersCount = 0;
    var dupKeys = Object.keys(crossSemesterKeyMap);
    for (var dk = 0; dk < dupKeys.length; dk++) {
      if (Object.keys(crossSemesterKeyMap[dupKeys[dk]]).length > 1) {
        duplicateAcrossSemestersCount++;
      }
    }

    applyRetakePolicy(flatCourses, policy);

    var semesterSummaries = [];
    var timeline = [];
    var totalIpkSks = 0;
    var totalIpkMutu = 0;
    var totalIpkCourses = 0;
    var totalAllCourses = 0;

    // Initialize grade distribution map preserving scale order
    var distBuckets = {};
    var orderedGrades = Scales.sortScaleGrades(scale.grades || []);
    for (var g = 0; g < orderedGrades.length; g++) {
      distBuckets[orderedGrades[g].letter] = {
        letter: orderedGrades[g].letter,
        weight: orderedGrades[g].weight,
        count: 0,
        sks: 0
      };
    }

    for (var si = 0; si < safeSemesters.length; si++) {
      var semCourses = semesterResolved[si];
      var semSks = 0;
      var semMutu = 0;
      var semCountedCourses = 0;
      var courseMap = {};

      for (var ci = 0; ci < semCourses.length; ci++) {
        var item = semCourses[ci];
        totalAllCourses++;
        courseMap[item.id] = item;

        if (item.countedInIps) {
          semSks += item.validSks;
          semMutu += item.mutu;
          semCountedCourses++;
        }

        if (item.countedInIpk) {
          totalIpkSks += item.validSks;
          totalIpkMutu += item.mutu;
          totalIpkCourses++;

          if (item.gradeEntry) {
            var letterKey = item.gradeEntry.letter;
            if (!distBuckets[letterKey]) {
              distBuckets[letterKey] = {
                letter: letterKey,
                weight: item.gradeEntry.weight,
                count: 0,
                sks: 0
              };
            }
            distBuckets[letterKey].count++;
            distBuckets[letterKey].sks += item.validSks;
          }
        }
      }

      var ips = semSks > 0 ? semMutu / semSks : null;
      var cumulativeIpkAtPoint = computePrefixIpk(safeSemesters.slice(0, si + 1), scale, policy);

      semesterSummaries.push({
        id: safeSemesters[si].id,
        name: safeSemesters[si].name,
        period: safeSemesters[si].period || '',
        totalCourses: semCourses.length,
        countedCourses: semCountedCourses,
        sks: semSks,
        mutu: semMutu,
        ips: ips,
        cumulativeIpk: cumulativeIpkAtPoint,
        courseMap: courseMap
      });

      timeline.push({
        index: si,
        label: safeSemesters[si].name || 'Sem ' + (si + 1),
        shortLabel: 'S' + (si + 1),
        ips: ips,
        ipk: cumulativeIpkAtPoint,
        sks: semSks
      });
    }

    var ipk = totalIpkSks > 0 ? totalIpkMutu / totalIpkSks : 0;

    // Latest semester with calculated IPS
    var latestIps = null;
    var prevIps = null;
    for (var li = semesterSummaries.length - 1; li >= 0; li--) {
      if (semesterSummaries[li].ips !== null) {
        if (latestIps === null) {
          latestIps = semesterSummaries[li].ips;
        } else if (prevIps === null) {
          prevIps = semesterSummaries[li].ips;
          break;
        }
      }
    }

    var ipsDelta = latestIps !== null && prevIps !== null ? latestIps - prevIps : null;
    var distribution = orderedGrades.map(function (gr) {
      return distBuckets[gr.letter];
    });

    return {
      ipk: ipk,
      hasCalculableCourses: totalIpkSks > 0,
      totalSks: totalIpkSks,
      totalMutu: totalIpkMutu,
      totalCountedCourses: totalIpkCourses,
      totalAllCourses: totalAllCourses,
      latestIps: latestIps,
      ipsDelta: ipsDelta,
      maxWeight: maxWeight,
      predikat: Scales.getPredikat(ipk, totalIpkSks > 0),
      nextMaxSks: Scales.getMaxSksRecommendation(latestIps),
      semesters: semesterSummaries,
      timeline: timeline,
      distribution: distribution,
      duplicateAcrossSemestersCount: duplicateAcrossSemestersCount
    };
  }

  function calculateTargetIpk(params) {
    var currentSks = Math.max(0, Number(params.currentSks) || 0);
    var currentMutu = Math.max(0, Number(params.currentMutu) || 0);
    var maxWeight = Math.max(0.1, Number(params.maxWeight) || 4.0);
    var targetIpk = Math.max(0, Math.min(maxWeight, Number(params.targetIpk) || 0));
    var totalTargetSks = Math.max(1, Number(params.totalTargetSks) || 144);

    var currentIpk = currentSks > 0 ? currentMutu / currentSks : 0;
    var remainingSks = totalTargetSks - currentSks;

    if (remainingSks <= 0) {
      var met = currentSks > 0 && currentIpk >= targetIpk - 0.0001;
      return {
        remainingSks: 0,
        requiredAvgIps: null,
        maxPossibleIpk: currentIpk,
        feasibility: met ? 'completed_met' : 'completed_unmet',
        badgeText: met ? 'Target Tercapai' : 'SKS Terpenuhi',
        badgeTone: met ? 'emerald' : 'amber',
        description: met
          ? 'Selamat! Total SKS kelulusan sudah terpenuhi dan IPK saat ini memenuhi target.'
          : 'Total SKS target sudah terpenuhi. Pertimbangkan perbaikan nilai jika ingin menaikkan IPK.'
      };
    }

    var requiredTotalMutu = targetIpk * totalTargetSks;
    var requiredRemainingMutu = requiredTotalMutu - currentMutu;
    var rawRequiredIps = requiredRemainingMutu / remainingSks;
    var maxPossibleIpk = (currentMutu + remainingSks * maxWeight) / totalTargetSks;

    if (rawRequiredIps <= 0) {
      return {
        remainingSks: remainingSks,
        requiredAvgIps: 0,
        maxPossibleIpk: maxPossibleIpk,
        feasibility: 'achieved',
        badgeText: 'Sudah Terkunci',
        badgeTone: 'emerald',
        description: 'Target IPK sudah aman secara matematis karena total mutu saat ini melampaui target.'
      };
    }

    if (rawRequiredIps > maxWeight + 0.0001) {
      return {
        remainingSks: remainingSks,
        requiredAvgIps: rawRequiredIps,
        maxPossibleIpk: maxPossibleIpk,
        feasibility: 'impossible',
        badgeText: 'Di Luar Batas Skala',
        badgeTone: 'rose',
        description:
          'Target membutuhkan IPS ' +
          rawRequiredIps.toFixed(2) +
          ' (melebihi ' +
          maxWeight.toFixed(2) +
          '). IPK maksimal yang bisa diraih pada ' +
          totalTargetSks +
          ' SKS adalah ' +
          maxPossibleIpk.toFixed(2) +
          '.'
      };
    }

    if (rawRequiredIps <= 3.0) {
      return {
        remainingSks: remainingSks,
        requiredAvgIps: rawRequiredIps,
        maxPossibleIpk: maxPossibleIpk,
        feasibility: 'easy',
        badgeText: 'Sangat Tercapai',
        badgeTone: 'emerald',
        description:
          'Pertahankan rata-rata IPS minimal ' +
          rawRequiredIps.toFixed(2) +
          ' pada ' +
          remainingSks +
          ' SKS tersisa untuk lulus dengan IPK ' +
          targetIpk.toFixed(2) +
          '.'
      };
    }

    if (rawRequiredIps <= 3.55) {
      return {
        remainingSks: remainingSks,
        requiredAvgIps: rawRequiredIps,
        maxPossibleIpk: maxPossibleIpk,
        feasibility: 'moderate',
        badgeText: 'Perlu Konsisten',
        badgeTone: 'blue',
        description:
          'Butuh rata-rata IPS ' +
          rawRequiredIps.toFixed(2) +
          ' (rata-rata nilai B+ hingga A-) di ' +
          remainingSks +
          ' SKS tersisa.'
      };
    }

    return {
      remainingSks: remainingSks,
      requiredAvgIps: rawRequiredIps,
      maxPossibleIpk: maxPossibleIpk,
      feasibility: 'challenging',
      badgeText: 'Menantang',
      badgeTone: 'amber',
      description:
        'Memerlukan performa sangat tinggi: rata-rata IPS ' +
        rawRequiredIps.toFixed(2) +
        ' (mayoritas nilai A / A-) di ' +
        remainingSks +
        ' SKS tersisa.'
    };
  }

  return {
    roundTo: roundTo,
    getCourseIdentityKey: getCourseIdentityKey,
    calculateAcademicSummary: calculateAcademicSummary,
    calculateTargetIpk: calculateTargetIpk
  };
});

