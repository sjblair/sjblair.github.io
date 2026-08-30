/* ---------- scrobble spectrograph ---------- */

(function () {
  "use strict";

  var DEFAULT_USER = "stu1011";
  var DEFAULT_KEY = "27d4a04019ea13369c9af9a3fe2d7bf0";
  var DAYS = 30; // rows in the ridgeline
  var HOUR_START = 8; // 8am
  var HOUR_END = 20; // 8pm
  var POINTS = HOUR_END - HOUR_START + 1; // one point per plotted hour

  var svgEl = document.getElementById("spectrograph-svg");

  /* ---------- deterministic placeholder data (used only if the fetch fails) ---------- */

  function seededRandom(seed) {
    var s = seed;
    return function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  function generateDemoRows(days) {
    var rnd = seededRandom(1979); // unknown pleasure
    var rows = [];
    for (var d = 0; d < days; d++) {
      var row = [];
      for (var i = 0; i < POINTS; i++) {
        var h = HOUR_START + i;
        var midday = Math.exp(-Math.pow(h - 13, 2) / 10) * 0.5;
        var evening = Math.exp(-Math.pow(h - 19, 2) / 6);
        var noise = rnd() * 0.5;
        row.push(Math.max(0, midday + evening + noise - 0.1));
      }
      rows.push(row);
    }
    return rows;
  }

  /* ---------- last.fm fetch + bucketing ---------- */

  function fetchScrobbles(user, apiKey, days) {
    var now = Math.floor(Date.now() / 1000);
    var from = now - days * 86400;
    var maxPages = 6; // respect public api

    function getPage(page, acc) {
      var url =
        "https://ws.audioscrobbler.com/2.0/?method=user.getrecenttracks" +
        "&user=" + encodeURIComponent(user) +
        "&api_key=" + encodeURIComponent(apiKey) +
        "&format=json&limit=200&from=" + from + "&page=" + page;

      return fetch(url)
        .then(function (res) {
          if (!res.ok) throw new Error("last.fm returned " + res.status);
          return res.json();
        })
        .then(function (data) {
          if (data.error) throw new Error(data.message || "last.fm api error");
          var rt = data.recenttracks || {};
          var tracks = rt.track || [];
          var combined = acc.concat(tracks);
          var totalPages = parseInt((rt["@attr"] && rt["@attr"].totalPages) || "1", 10);
          if (page < totalPages && page < maxPages) {
            return getPage(page + 1, combined);
          }
          return combined;
        });
    }

    return getPage(1, []);
  }

  function bucketByDayHour(tracks, days) {
    var buckets = {};
    tracks.forEach(function (t) {
      if (!t.date || !t.date.uts) return; // skip the currently-playing entry, no timestamp
      var ts = parseInt(t.date.uts, 10) * 1000;
      var d = new Date(ts);
      var hour = d.getHours();
      if (hour < HOUR_START || hour > HOUR_END) return; // outside the 8am–8pm window plotted
      var dayKey = d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
      if (!buckets[dayKey]) buckets[dayKey] = new Array(POINTS).fill(0);
      buckets[dayKey][hour - HOUR_START] += 1;
    });
    var sortedDays = Object.keys(buckets).sort();
    var lastDays = sortedDays.slice(-days);
    return lastDays.map(function (k) { return buckets[k]; });
  }

  function pad(n) { return n < 10 ? "0" + n : "" + n; }

  function smoothRows(rows) {
    return rows; // no smoothing, jagged on purpose
  }

  function normalizeRows(rows) {
    var max = 0;
    rows.forEach(function (row) {
      row.forEach(function (v) { if (v > max) max = v; });
    });
    if (max === 0) max = 1;
    return rows.map(function (row) { return row.map(function (v) { return v / max; }); });
  }

  /* ---------- svg rendering: occlusion technique ---------- */

  function linePath(points) {
    if (points.length < 2) return "";
    var d = "M " + points[0][0].toFixed(2) + "," + points[0][1].toFixed(2) + " ";
    for (var i = 1; i < points.length; i++) {
      d += "L " + points[i][0].toFixed(2) + "," + points[i][1].toFixed(2) + " ";
    }
    return d;
  }

  function renderRidgeline(rows) {
    var width = 1000;
    var rowGap = 12;
    var peakHeight = 66; // must be <= topPad, prevents front row's peak clipping off the top edge
    var topPad = peakHeight + 10;
    var bottomPad = 20;
    var height = topPad + rows.length * rowGap + bottomPad;
    var chartBottom = height + 40;

    var svgns = "http://www.w3.org/2000/svg";
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.setAttribute("viewBox", "0 0 " + width + " " + height);
    svgEl.setAttribute("preserveAspectRatio", "xMidYMid meet");

    var bg = document.createElementNS(svgns, "rect");
    bg.setAttribute("x", 0);
    bg.setAttribute("y", 0);
    bg.setAttribute("width", width);
    bg.setAttribute("height", height);
    bg.setAttribute("fill", "#0a0a0a");
    svgEl.appendChild(bg);

    var g = document.createElementNS(svgns, "g");
    svgEl.appendChild(g);

    rows.forEach(function (row, i) {
      var baseline = topPad + i * rowGap;
      var points = row.map(function (v, h) {
        var x = (h / (POINTS - 1)) * width;
        var y = Math.max(2, baseline - v * peakHeight); // clamp: never draw above the canvas edge
        return [x, y];
      });

      var curveD = linePath(points);
      var lastX = points[points.length - 1][0];
      var firstX = points[0][0];
      var fillD = curveD + " L " + lastX.toFixed(2) + "," + chartBottom.toFixed(2) +
        " L " + firstX.toFixed(2) + "," + chartBottom.toFixed(2) + " Z";

      var fillPath = document.createElementNS(svgns, "path");
      fillPath.setAttribute("d", fillD);
      fillPath.setAttribute("fill", "#0a0a0a");
      g.appendChild(fillPath);

      var strokePath = document.createElementNS(svgns, "path");
      strokePath.setAttribute("d", curveD);
      strokePath.setAttribute("fill", "none");
      strokePath.setAttribute("stroke", "#f2f2ee");
      strokePath.setAttribute("stroke-width", "1.1");
      g.appendChild(strokePath);
    });
  }

  /* ---------- load ---------- */

  function loadAndRender() {
    fetchScrobbles(DEFAULT_USER, DEFAULT_KEY, DAYS)
      .then(function (tracks) {
        var rows = bucketByDayHour(tracks, DAYS);
        if (rows.length === 0) throw new Error("no scrobbles found in that window");
        renderRidgeline(normalizeRows(smoothRows(rows)));
      })
      .catch(function () {
        renderRidgeline(normalizeRows(smoothRows(generateDemoRows(DAYS))));
      });
  }

  loadAndRender();

  /* ---------- reveal-on-scroll ---------- */

  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && revealEls.length) {
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add("in"); });
  }
})();
