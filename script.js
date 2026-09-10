/* =========================================================
   Ordered Pairs Calculator — script.js
   Contains:
   1. Mobile nav toggle
   2. A small, dependency-free math expression parser/evaluator
   3. Calculator UI wiring (mode toggle, calculate, reset, errors)
   ========================================================= */

(function () {
  "use strict";

  /* ---------- Footer year ---------- */
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Mobile nav ---------- */
  var navToggle = document.getElementById("navToggle");
  var siteNav = document.getElementById("siteNav");
  if (navToggle && siteNav) {
    navToggle.addEventListener("click", function () {
      var isOpen = siteNav.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });
    siteNav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        siteNav.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  /* =========================================================
     MATH EXPRESSION PARSER
     Supports: + - * / ^, unary minus, parentheses, implicit
     multiplication (2x, 2(x+1), x(x+1)), the variable x,
     constants pi/e, and functions sqrt/abs/sin/cos/tan/ln/log.
     No eval() is used anywhere.
     ========================================================= */

  var FUNCTIONS = {
    sqrt: Math.sqrt,
    abs: Math.abs,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    ln: Math.log,
    log: Math.log10
  };

  var CONSTANTS = {
    pi: Math.PI,
    e: Math.E
  };

  function ExpressionError(message) {
    this.name = "ExpressionError";
    this.message = message;
  }
  ExpressionError.prototype = Object.create(Error.prototype);

  /* ---- Tokenizer ---- */
  function tokenize(raw) {
    var src = raw;
    var tokens = [];
    var i = 0;

    function isDigit(ch) { return ch >= "0" && ch <= "9"; }
    function isAlpha(ch) { return /[a-zA-Z_]/.test(ch); }

    while (i < src.length) {
      var ch = src[i];

      if (ch === " " || ch === "\t") { i++; continue; }

      if (isDigit(ch) || (ch === "." && isDigit(src[i + 1]))) {
        var start = i;
        var seenDot = false;
        while (i < src.length && (isDigit(src[i]) || (src[i] === "." && !seenDot))) {
          if (src[i] === ".") seenDot = true;
          i++;
        }
        tokens.push({ type: "number", value: parseFloat(src.slice(start, i)) });
        continue;
      }

      if (isAlpha(ch)) {
        var startA = i;
        while (i < src.length && /[a-zA-Z_0-9]/.test(src[i])) i++;
        var word = src.slice(startA, i).toLowerCase();
        if (FUNCTIONS.hasOwnProperty(word)) {
          tokens.push({ type: "func", value: word });
        } else if (CONSTANTS.hasOwnProperty(word)) {
          tokens.push({ type: "number", value: CONSTANTS[word] });
        } else if (word === "x") {
          tokens.push({ type: "var" });
        } else {
          throw new ExpressionError("Unknown term \"" + word + "\" in your equation.");
        }
        continue;
      }

      if ("+-*/^(),".indexOf(ch) !== -1) {
        tokens.push({ type: ch });
        i++;
        continue;
      }

      throw new ExpressionError("Unsupported character \"" + ch + "\" in your equation.");
    }

    /* Insert implicit multiplication tokens, e.g. 2x -> 2 * x, 2(x) -> 2 * (x), x( -> x * ( */
    var out = [];
    for (var t = 0; t < tokens.length; t++) {
      var cur = tokens[t];
      if (out.length > 0) {
        var prev = out[out.length - 1];
        var prevEndsValue = (prev.type === "number" || prev.type === "var" || prev.type === ")");
        var curStartsValue = (cur.type === "number" || cur.type === "var" || cur.type === "(" || cur.type === "func");
        if (prevEndsValue && curStartsValue) {
          out.push({ type: "*" });
        }
      }
      out.push(cur);
    }
    return out;
  }

  /* ---- Recursive-descent parser -> AST ---- */
  function parse(tokens) {
    var pos = 0;

    function peek() { return tokens[pos]; }
    function next() { return tokens[pos++]; }
    function expect(type) {
      var t = peek();
      if (!t || t.type !== type) {
        throw new ExpressionError("Your equation is missing a \"" + type + "\" or has one in the wrong place.");
      }
      return next();
    }

    function parseExpression() {
      var node = parseTerm();
      while (peek() && (peek().type === "+" || peek().type === "-")) {
        var op = next().type;
        var right = parseTerm();
        node = { type: "binary", op: op, left: node, right: right };
      }
      return node;
    }

    function parseTerm() {
      var node = parseUnary();
      while (peek() && (peek().type === "*" || peek().type === "/")) {
        var op = next().type;
        var right = parseUnary();
        node = { type: "binary", op: op, left: node, right: right };
      }
      return node;
    }

    function parseUnary() {
      if (peek() && peek().type === "-") {
        next();
        return { type: "negate", value: parseUnary() };
      }
      if (peek() && peek().type === "+") {
        next();
        return parseUnary();
      }
      return parsePower();
    }

    function parsePower() {
      var base = parsePrimary();
      if (peek() && peek().type === "^") {
        next();
        var exponent = parseUnary(); // right-associative, allows -x^-2
        return { type: "binary", op: "^", left: base, right: exponent };
      }
      return base;
    }

    function parsePrimary() {
      var t = peek();
      if (!t) throw new ExpressionError("Your equation is incomplete.");

      if (t.type === "number") { next(); return { type: "number", value: t.value }; }
      if (t.type === "var") { next(); return { type: "var" }; }

      if (t.type === "func") {
        next();
        expect("(");
        var arg = parseExpression();
        expect(")");
        return { type: "call", name: t.value, arg: arg };
      }

      if (t.type === "(") {
        next();
        var inner = parseExpression();
        expect(")");
        return inner;
      }

      throw new ExpressionError("Your equation has an unexpected term near \"" + t.type + "\".");
    }

    var result = parseExpression();
    if (pos < tokens.length) {
      throw new ExpressionError("Your equation has extra characters that couldn't be parsed.");
    }
    return result;
  }

  /* ---- Evaluate AST for a given x ---- */
  function evaluate(node, x) {
    switch (node.type) {
      case "number": return node.value;
      case "var": return x;
      case "negate": return -evaluate(node.value, x);
      case "call": {
        var argVal = evaluate(node.arg, x);
        var fn = FUNCTIONS[node.name];
        if (node.name === "sqrt" && argVal < 0) {
          throw new ExpressionError("sqrt of a negative number is undefined here.");
        }
        if ((node.name === "ln" || node.name === "log") && argVal <= 0) {
          throw new ExpressionError("log/ln of a non-positive number is undefined here.");
        }
        return fn(argVal);
      }
      case "binary": {
        var l = evaluate(node.left, x);
        var r = evaluate(node.right, x);
        switch (node.op) {
          case "+": return l + r;
          case "-": return l - r;
          case "*": return l * r;
          case "/":
            if (r === 0) throw new ExpressionError("Division by zero is undefined here.");
            return l / r;
          case "^": return Math.pow(l, r);
        }
      }
    }
    throw new ExpressionError("Could not evaluate the equation.");
  }

  /* ---- Clean up a raw equation string before tokenizing ---- */
  function stripLeadingLabel(raw) {
    var s = raw.trim();
    // Strip a leading "y =" or "f(x) =" style label, if present.
    s = s.replace(/^[a-zA-Z]\s*\(\s*x\s*\)\s*=\s*/i, "");
    s = s.replace(/^[a-zA-Z]\s*=\s*/i, "");
    return s.trim();
  }

  function compileEquation(raw) {
    if (!raw || !raw.trim()) {
      throw new ExpressionError("Please enter an equation, such as y = 2x + 3.");
    }
    var cleaned = stripLeadingLabel(raw);
    if (!cleaned) {
      throw new ExpressionError("Please enter the right-hand side of your equation, such as 2x + 3.");
    }
    var tokens = tokenize(cleaned);
    if (tokens.length === 0) {
      throw new ExpressionError("Please enter an equation, such as y = 2x + 3.");
    }
    return parse(tokens);
  }

  /* =========================================================
     UI WIRING
     ========================================================= */

  var equationInput = document.getElementById("equationInput");
  var xStart = document.getElementById("xStart");
  var xEnd = document.getElementById("xEnd");
  var xStep = document.getElementById("xStep");
  var xList = document.getElementById("xList");
  var rangePanel = document.getElementById("rangePanel");
  var listPanel = document.getElementById("listPanel");
  var calculateBtn = document.getElementById("calculateBtn");
  var resetBtn = document.getElementById("resetBtn");
  var errorMessage = document.getElementById("errorMessage");
  var resultsArea = document.getElementById("resultsArea");
  var resultsExplain = document.getElementById("resultsExplain");
  var resultsBody = document.getElementById("resultsBody");
  var modeRadios = document.querySelectorAll('input[name="xMode"]');

  if (!calculateBtn) return; // Calculator not on this page.

  modeRadios.forEach(function (radio) {
    radio.addEventListener("change", function () {
      var mode = getMode();
      rangePanel.hidden = mode !== "range";
      listPanel.hidden = mode !== "list";
    });
  });

  function getMode() {
    var checked = document.querySelector('input[name="xMode"]:checked');
    return checked ? checked.value : "range";
  }

  function showError(msg) {
    errorMessage.textContent = msg;
    errorMessage.hidden = false;
    resultsArea.hidden = true;
  }

  function clearError() {
    errorMessage.hidden = true;
    errorMessage.textContent = "";
  }

  function formatNumber(n) {
    if (Object.is(n, -0)) n = 0;
    var rounded = Math.round(n * 10000) / 10000;
    return String(rounded);
  }

  function getXValues() {
    var mode = getMode();
    var values = [];

    if (mode === "list") {
      var raw = (xList.value || "").trim();
      if (!raw) throw new ExpressionError("Enter at least one x-value, such as -2, 0, 3.");
      var parts = raw.split(",");
      for (var i = 0; i < parts.length; i++) {
        var piece = parts[i].trim();
        if (!piece) continue;
        var num = Number(piece);
        if (isNaN(num)) {
          throw new ExpressionError("\"" + piece + "\" isn't a valid number in your x-value list.");
        }
        values.push(num);
      }
      if (values.length === 0) {
        throw new ExpressionError("Enter at least one x-value, such as -2, 0, 3.");
      }
      if (values.length > 200) {
        throw new ExpressionError("Please enter 200 x-values or fewer.");
      }
      return values;
    }

    var start = Number(xStart.value);
    var end = Number(xEnd.value);
    var step = Number(xStep.value);

    if (isNaN(start) || isNaN(end) || isNaN(step)) {
      throw new ExpressionError("Start, end, and step must all be numbers.");
    }
    if (step <= 0) {
      throw new ExpressionError("Step must be greater than 0.");
    }
    if (end < start) {
      throw new ExpressionError("End must be greater than or equal to start.");
    }
    var count = Math.floor((end - start) / step) + 1;
    if (count > 200) {
      throw new ExpressionError("That range produces too many values. Use a larger step or a smaller range (200 max).");
    }

    for (var x = start, n = 0; n < count; x = start + (++n) * step) {
      values.push(Math.round(x * 1e10) / 1e10);
    }
    // Guarantee the end value is included even with floating point drift.
    if (values[values.length - 1] < end - 1e-9) {
      values.push(end);
    }
    return values;
  }

  function runCalculation() {
    clearError();
    try {
      var ast = compileEquation(equationInput.value);
      var xValues = getXValues();

      resultsBody.innerHTML = "";
      var undefinedCount = 0;

      xValues.forEach(function (x) {
        var row = document.createElement("tr");
        var y, yDisplay, pairDisplay;
        try {
          y = evaluate(ast, x);
          if (!isFinite(y)) throw new ExpressionError("undefined");
          yDisplay = formatNumber(y);
          pairDisplay = "(" + formatNumber(x) + ", " + yDisplay + ")";
        } catch (innerErr) {
          yDisplay = "undefined";
          pairDisplay = "—";
          row.className = "undefined-row";
          undefinedCount++;
        }
        row.innerHTML =
          "<td>" + formatNumber(x) + "</td>" +
          "<td>" + yDisplay + "</td>" +
          "<td>" + pairDisplay + "</td>";
        resultsBody.appendChild(row);
      });

      var plural = xValues.length === 1 ? "pair" : "pairs";
      var note = "Showing " + xValues.length + " ordered " + plural + ".";
      if (undefinedCount > 0) {
        note += " " + undefinedCount + " value" + (undefinedCount === 1 ? " is" : "s are") + " undefined for this equation.";
      }
      resultsExplain.textContent = note;
      resultsArea.hidden = false;
    } catch (err) {
      if (err instanceof ExpressionError) {
        showError(err.message);
      } else {
        showError("Something went wrong reading that equation. Double-check the syntax and try again.");
      }
    }
  }

  calculateBtn.addEventListener("click", runCalculation);

  equationInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") runCalculation();
  });
  if (xList) {
    xList.addEventListener("keydown", function (e) {
      if (e.key === "Enter") runCalculation();
    });
  }

  resetBtn.addEventListener("click", function () {
    equationInput.value = "";
    xStart.value = "-5";
    xEnd.value = "5";
    xStep.value = "1";
    xList.value = "";
    document.querySelector('input[name="xMode"][value="range"]').checked = true;
    rangePanel.hidden = false;
    listPanel.hidden = true;
    clearError();
    resultsArea.hidden = true;
    equationInput.focus();
  });

})();
