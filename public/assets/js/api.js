(function (root) {
  'use strict';

  root.IPKApp = root.IPKApp || {};

  function getCsrfToken() {
    var meta = document.querySelector('meta[name="csrf-token"]');
    return meta ? meta.getAttribute('content') : '';
  }

  function request(method, url, body, extraOpts) {
    var opts = Object.assign(
      {
        method: method,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          'X-CSRF-TOKEN': getCsrfToken(),
          'X-Requested-With': 'XMLHttpRequest'
        },
        credentials: 'same-origin'
      },
      extraOpts || {}
    );

    if (body !== undefined && body !== null) {
      opts.body = JSON.stringify(body);
    }

    return fetch(url, opts).then(function (res) {
      if (!res.ok) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (errBody) {
            var msg = errBody.message || 'Terjadi kesalahan saat menghubungi server (' + res.status + ').';
            var err = new Error(msg);
            err.status = res.status;
            throw err;
          });
      }
      if (res.status === 204) return null;
      return res.json();
    });
  }

  function downloadFile(filename, content, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 500);
  }

  function exportJson(state) {
    var cleanData = {
      version: 1,
      theme: state.theme,
      profile: state.profile,
      scale: state.scale,
      retakePolicy: state.retakePolicy,
      planner: state.planner,
      semesters: state.semesters
    };
    var payload = {
      app: 'IPKPRO',
      exportedAt: new Date().toISOString(),
      data: cleanData
    };
    var dateSlug = new Date().toISOString().slice(0, 10);
    downloadFile(
      'transkrip-ipkpro-' + dateSlug + '.json',
      JSON.stringify(payload, null, 2),
      'application/json;charset=utf-8'
    );
  }

  function csvCell(val) {
    var str = String(val === null || val === undefined ? '' : val);
    if (/[",\n\r;]/.test(str)) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  function exportCsv(state, summary) {
    var lines = [];
    lines.push(
      ['Semester', 'Periode', 'Kode MK', 'Nama Mata Kuliah', 'SKS', 'Nilai Angka', 'Nilai Huruf', 'Bobot', 'Mutu', 'Status Hitung IPK']
        .map(csvCell)
        .join(',')
    );

    for (var s = 0; s < state.semesters.length; s++) {
      var sem = state.semesters[s];
      var semSum = summary.semesters[s];
      for (var c = 0; c < sem.courses.length; c++) {
        var mk = sem.courses[c];
        var res = semSum && semSum.courseMap ? semSum.courseMap[mk.id] : null;
        var status = 'Dihitung';
        if (mk.included === false) status = 'Dinonaktifkan';
        else if (res && res.supersededByIpk) status = 'Digantikan (Mengulang)';
        else if (!res || !res.calculable) status = 'Belum Lengkap';

        lines.push(
          [
            sem.name,
            sem.period || '',
            mk.code || '',
            mk.name || '',
            mk.sks,
            mk.numericScore !== null && mk.numericScore !== undefined ? mk.numericScore : '',
            mk.grade || '',
            res && res.gradeEntry ? res.weight.toFixed(2) : '',
            res && res.calculable ? res.mutu.toFixed(2) : '',
            status
          ]
            .map(csvCell)
            .join(',')
        );
      }
    }

    lines.push('');
    lines.push(
      ['TOTAL SKS IPK', summary.totalSks, 'TOTAL MUTU', summary.totalMutu.toFixed(2), 'IPK AKHIR', summary.ipk.toFixed(2), 'PREDIKAT', summary.predikat.label]
        .map(csvCell)
        .join(',')
    );

    var dateSlug = new Date().toISOString().slice(0, 10);
    downloadFile('transkrip-ipkpro-' + dateSlug + '.csv', '\uFEFF' + lines.join('\r\n'), 'text/csv;charset=utf-8');
  }

  function parseImportedJson(jsonText) {
    var parsed = JSON.parse(jsonText);
    var target = parsed && parsed.data ? parsed.data : parsed;
    if (!target || !Array.isArray(target.semesters)) {
      throw new Error('Format file JSON tidak valid untuk IPKPRO.');
    }
    return target;
  }

  root.IPKApp.Api = {
    updateSettings: function (payload, extraOpts) {
      return request('PATCH', '/api/workspace/settings', payload, extraOpts);
    },
    loadDemo: function () {
      return request('POST', '/api/workspace/demo', {});
    },
    importData: function (payload) {
      return request('POST', '/api/workspace/import', payload);
    },
    resetWorkspace: function () {
      return request('POST', '/api/workspace/reset', {});
    },
    createSemester: function (payload) {
      return request('POST', '/api/semesters', payload);
    },
    updateSemester: function (id, payload, extraOpts) {
      return request('PATCH', '/api/semesters/' + encodeURIComponent(id), payload, extraOpts);
    },
    toggleAllSemesters: function (collapsed) {
      return request('POST', '/api/semesters/toggle-all', { collapsed: collapsed });
    },
    reorderSemesters: function (ids) {
      return request('POST', '/api/semesters/reorder', { ids: ids });
    },
    duplicateSemester: function (id) {
      return request('POST', '/api/semesters/' + encodeURIComponent(id) + '/duplicate', {});
    },
    deleteSemester: function (id) {
      return request('DELETE', '/api/semesters/' + encodeURIComponent(id));
    },
    restoreSemester: function (payload) {
      return request('POST', '/api/semesters/restore', payload);
    },
    createCourse: function (semesterId, payload) {
      return request('POST', '/api/semesters/' + encodeURIComponent(semesterId) + '/courses', payload);
    },
    updateCourse: function (id, payload, extraOpts) {
      return request('PATCH', '/api/courses/' + encodeURIComponent(id), payload, extraOpts);
    },
    deleteCourse: function (id) {
      return request('DELETE', '/api/courses/' + encodeURIComponent(id));
    },
    exportJson: exportJson,
    exportCsv: exportCsv,
    parseImportedJson: parseImportedJson
  };
})(typeof self !== 'undefined' ? self : this);

