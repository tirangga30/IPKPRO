(function (root) {
  'use strict';

  root.IPKApp = root.IPKApp || {};

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function buildSmoothPath(points) {
    if (!points.length) return '';
    if (points.length === 1) {
      return 'M ' + points[0].x.toFixed(1) + ' ' + points[0].y.toFixed(1);
    }
    var d = 'M ' + points[0].x.toFixed(1) + ' ' + points[0].y.toFixed(1);
    for (var i = 0; i < points.length - 1; i++) {
      var p0 = points[i];
      var p1 = points[i + 1];
      var midX = ((p0.x + p1.x) / 2).toFixed(1);
      d +=
        ' C ' +
        midX +
        ' ' +
        p0.y.toFixed(1) +
        ', ' +
        midX +
        ' ' +
        p1.y.toFixed(1) +
        ', ' +
        p1.x.toFixed(1) +
        ' ' +
        p1.y.toFixed(1);
    }
    return d;
  }

  function renderTrendChart(container, timeline, maxWeight, targetIpk) {
    if (!container) return;

    var validPoints = (timeline || []).filter(function (pt) {
      return pt.ips !== null && Number.isFinite(pt.ips);
    });

    if (validPoints.length === 0) {
      container.innerHTML =
        '<div class="chart-empty">' +
        '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>' +
        '<span>Grafik tren IPS &amp; IPK akan muncul otomatis setelah ada minimal 1 mata kuliah bernilai.</span>' +
        '</div>';
      return;
    }

    var width = 520;
    var height = 218;
    var padLeft = 38;
    var padRight = 38;
    var padTop = 20;
    var padBottom = 32;
    var plotW = width - padLeft - padRight;
    var plotH = height - padTop - padBottom;
    var safeMax = maxWeight > 0 ? maxWeight : 4.0;

    function yPos(val) {
      var clamped = Math.max(0, Math.min(safeMax, val));
      return padTop + plotH - (clamped / safeMax) * plotH;
    }

    function xPos(idx, total) {
      if (total <= 1) return padLeft + plotW / 2;
      return padLeft + (idx / (total - 1)) * plotW;
    }

    var ipsPts = [];
    var ipkPts = [];
    for (var i = 0; i < validPoints.length; i++) {
      var x = xPos(i, validPoints.length);
      ipsPts.push({ x: x, y: yPos(validPoints[i].ips), data: validPoints[i] });
      ipkPts.push({
        x: x,
        y: yPos(validPoints[i].ipk !== null ? validPoints[i].ipk : validPoints[i].ips),
        data: validPoints[i]
      });
    }

    var gridSteps = [0, 1, 2, 3, safeMax];
    var gridSvg = '';
    for (var g = 0; g < gridSteps.length; g++) {
      var gv = gridSteps[g];
      if (gv > safeMax + 0.001) continue;
      var gy = yPos(gv);
      gridSvg +=
        '<line class="chart-grid-line" x1="' +
        padLeft +
        '" y1="' +
        gy.toFixed(1) +
        '" x2="' +
        (width - padRight) +
        '" y2="' +
        gy.toFixed(1) +
        '" />' +
        '<text class="chart-axis-label" x="' +
        (padLeft - 8) +
        '" y="' +
        (gy + 3.5).toFixed(1) +
        '" text-anchor="end">' +
        gv.toFixed(1) +
        '</text>';
    }

    // Target reference line
    var targetLineSvg = '';
    if (Number.isFinite(targetIpk) && targetIpk > 0 && targetIpk <= safeMax) {
      var ty = yPos(targetIpk);
      targetLineSvg =
        '<line class="chart-target-line" x1="' +
        padLeft +
        '" y1="' +
        ty.toFixed(1) +
        '" x2="' +
        (width - padRight) +
        '" y2="' +
        ty.toFixed(1) +
        '" />' +
        '<text class="chart-target-label" x="' +
        (padLeft + 6) +
        '" y="' +
        (ty > padTop + 12 ? ty - 5 : ty + 12).toFixed(1) +
        '" text-anchor="start">Target ' +
        targetIpk.toFixed(2) +
        '</text>';
    }

    var ipkPath = buildSmoothPath(ipkPts);
    var ipsPath = buildSmoothPath(ipsPts);

    var areaSvg = '';
    if (ipkPts.length > 1) {
      var baseLineY = yPos(0).toFixed(1);
      var areaD =
        ipkPath +
        ' L ' +
        ipkPts[ipkPts.length - 1].x.toFixed(1) +
        ' ' +
        baseLineY +
        ' L ' +
        ipkPts[0].x.toFixed(1) +
        ' ' +
        baseLineY +
        ' Z';
      areaSvg = '<path class="chart-area-ipk" d="' + areaD + '" fill="url(#ipkAreaGrad)" />';
    }

    var linesSvg = '';
    if (validPoints.length > 1) {
      linesSvg += '<path class="chart-line-ips" d="' + ipsPath + '" fill="none" />';
      linesSvg += '<path class="chart-line-ipk" d="' + ipkPath + '" fill="none" />';
    }

    var xLabelsSvg = '';
    var dotsSvg = '';
    var hitTargetsSvg = '';
    var colW = validPoints.length > 1 ? plotW / (validPoints.length - 1) : plotW;

    for (var p = 0; p < validPoints.length; p++) {
      var pt = validPoints[p];
      var px = ipsPts[p].x;
      var pyIps = ipsPts[p].y;
      var pyIpk = ipkPts[p].y;

      var xLabel = validPoints.length > 7 ? pt.shortLabel : pt.label;
      if (xLabel.length > 11) {
        xLabel = xLabel.slice(0, 10) + '…';
      }

      xLabelsSvg +=
        '<text class="chart-axis-label" x="' +
        px.toFixed(1) +
        '" y="' +
        (height - 8) +
        '" text-anchor="middle">' +
        escapeHtml(xLabel) +
        '</text>';

      dotsSvg +=
        '<circle class="chart-dot-ips" cx="' +
        px.toFixed(1) +
        '" cy="' +
        pyIps.toFixed(1) +
        '" r="4" />' +
        '<circle class="chart-dot-ipk" cx="' +
        px.toFixed(1) +
        '" cy="' +
        pyIpk.toFixed(1) +
        '" r="4.5" />';

      if (validPoints.length === 1) {
        dotsSvg +=
          '<text class="chart-single-val" x="' +
          px.toFixed(1) +
          '" y="' +
          (pyIpk - 12).toFixed(1) +
          '" text-anchor="middle">IPS / IPK: ' +
          pt.ips.toFixed(2) +
          '</text>';
      }

      var rectX = validPoints.length > 1 ? Math.max(padLeft, px - colW / 2) : padLeft;
      var rectW = validPoints.length > 1 ? colW : plotW;
      hitTargetsSvg +=
        '<rect class="chart-hit-zone" data-pt-index="' +
        p +
        '" x="' +
        rectX.toFixed(1) +
        '" y="' +
        padTop +
        '" width="' +
        rectW.toFixed(1) +
        '" height="' +
        plotH +
        '" fill="transparent" />';
    }

    container.innerHTML =
      '<div class="chart-svg-wrap">' +
      '<svg class="trend-svg" viewBox="0 0 ' +
      width +
      ' ' +
      height +
      '" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Grafik tren IPS dan IPK per semester">' +
      '<defs>' +
      '<linearGradient id="ipkAreaGrad" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0%" stop-color="#0d9488" stop-opacity="0.22" />' +
      '<stop offset="100%" stop-color="#0d9488" stop-opacity="0.01" />' +
      '</linearGradient>' +
      '</defs>' +
      gridSvg +
      targetLineSvg +
      areaSvg +
      linesSvg +
      xLabelsSvg +
      '<line class="chart-hover-guide" id="chartHoverGuide" x1="0" y1="' +
      padTop +
      '" x2="0" y2="' +
      (padTop + plotH) +
      '" opacity="0" />' +
      dotsSvg +
      hitTargetsSvg +
      '</svg>' +
      '<div class="chart-tooltip" id="chartTooltip" hidden></div>' +
      '</div>';

    var tooltip = container.querySelector('#chartTooltip');
    var guide = container.querySelector('#chartHoverGuide');
    var hits = container.querySelectorAll('.chart-hit-zone');

    function showTooltip(index) {
      var pt = validPoints[index];
      var px = ipsPts[index].x;
      if (guide) {
        guide.setAttribute('x1', px.toFixed(1));
        guide.setAttribute('x2', px.toFixed(1));
        guide.setAttribute('opacity', '1');
      }
      if (!tooltip) return;
      var ipkStr = pt.ipk !== null ? pt.ipk.toFixed(2) : '—';
      tooltip.innerHTML =
        '<div class="tt-title">' +
        escapeHtml(pt.label) +
        ' <span class="tt-sks">(' +
        pt.sks +
        ' SKS)</span></div>' +
        '<div class="tt-row"><span class="dot dot-ips"></span> IPS: <strong class="mono">' +
        pt.ips.toFixed(2) +
        '</strong></div>' +
        '<div class="tt-row"><span class="dot dot-ipk"></span> IPK: <strong class="mono">' +
        ipkStr +
        '</strong></div>';
      tooltip.hidden = false;

      var pctLeft = (px / width) * 100;
      tooltip.style.left = Math.min(82, Math.max(18, pctLeft)) + '%';
    }

    function hideTooltip() {
      if (guide) guide.setAttribute('opacity', '0');
      if (tooltip) tooltip.hidden = true;
    }

    for (var h = 0; h < hits.length; h++) {
      (function (el) {
        var idx = Number(el.getAttribute('data-pt-index'));
        el.addEventListener('mouseenter', function () {
          showTooltip(idx);
        });
        el.addEventListener('click', function () {
          showTooltip(idx);
        });
      })(hits[h]);
    }

    container.addEventListener('mouseleave', hideTooltip);
  }

  function renderDistribution(container, distribution, totalCountedCourses, totalSks, maxWeight) {
    if (!container) return;

    var activeItems = (distribution || []).filter(function (d) {
      return d && d.count > 0;
    });

    if (activeItems.length === 0 || totalCountedCourses === 0) {
      container.innerHTML =
        '<div class="chart-empty">' +
        '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M8 16v-5"></path><path d="M12 16V8"></path><path d="M16 16v-3"></path></svg>' +
        '<span>Distribusi nilai huruf akan tampil di sini setelah kamu memasukkan nilai mata kuliah.</span>' +
        '</div>';
      return;
    }

    var Sc = root.IPKApp.Scales;
    var stackedHtml = '<div class="dist-stacked-bar" aria-label="Proporsi SKS per nilai">';
    for (var i = 0; i < activeItems.length; i++) {
      var item = activeItems[i];
      var sksPct = totalSks > 0 ? (item.sks / totalSks) * 100 : 0;
      var tone = Sc.getGradeTone(item.weight, maxWeight);
      stackedHtml +=
        '<div class="dist-seg tone-' +
        tone +
        '" style="width:' +
        sksPct.toFixed(2) +
        '%" title="' +
        escapeHtml(item.letter) +
        ': ' +
        item.count +
        ' MK (' +
        item.sks +
        ' SKS)"></div>';
    }
    stackedHtml += '</div>';

    var rowsHtml = '<div class="dist-rows">';
    for (var j = 0; j < activeItems.length; j++) {
      var d = activeItems[j];
      var pct = totalSks > 0 ? Math.round((d.sks / totalSks) * 100) : 0;
      var gTone = Sc.getGradeTone(d.weight, maxWeight);
      rowsHtml +=
        '<div class="dist-row">' +
        '<span class="grade-pill tone-' +
        gTone +
        '">' +
        escapeHtml(d.letter) +
        '</span>' +
        '<div class="dist-bar-track"><div class="dist-bar-fill tone-' +
        gTone +
        '" style="width:' +
        pct +
        '%"></div></div>' +
        '<span class="dist-meta mono">' +
        d.count +
        ' MK · ' +
        d.sks +
        ' SKS (' +
        pct +
        '%)</span>' +
        '</div>';
    }
    rowsHtml += '</div>';

    container.innerHTML = stackedHtml + rowsHtml;
  }

  root.IPKApp.Charts = {
    renderTrendChart: renderTrendChart,
    renderDistribution: renderDistribution
  };
})(typeof self !== 'undefined' ? self : this);
