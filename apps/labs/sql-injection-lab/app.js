/* Login query audit lab — client-side simulation for feedback only.
   The authoritative decision is recomputed by the server validator. */

const SDK = window.LearningSDK;

const DEFENCES = [
  {
    id: "parameterize",
    title: "使用参数化查询（值绑定）",
    description: "语句结构先固定，用户输入只作为参数值传输。",
  },
  {
    id: "escape-quotes",
    title: "转义单引号",
    description: "把 ' 替换为 ''。能让引号保持字面量，但数值上下文无效。",
  },
  {
    id: "strip-comments",
    title: "移除 SQL 注释符",
    description: "删除 --、#、/* */。可阻止注释截断，但不阻止 UNION。",
  },
  {
    id: "type-cast",
    title: "对数值参数做类型转换",
    description: "强制 id 等数值参数为整数，阻断 1 OR 1=1 这类载荷。",
  },
  {
    id: "allowlist-identifier",
    title: "标识符白名单",
    description: "表名/列名只允许服务端枚举值。对值参数的注入无效。",
  },
];

const PAYLOADS = [
  { id: "classic", label: "' OR '1'='1' --", kind: "quoted", context: "邮箱字符串" },
  { id: "comment", label: "admin'--", kind: "comment", context: "邮箱字符串" },
  {
    id: "union",
    label: "' UNION SELECT password FROM users--",
    kind: "quoted",
    context: "邮箱字符串",
  },
  { id: "numeric", label: "1 OR 1=1", kind: "numeric", context: "用户 ID 数值" },
];

const REQUIREMENT = {
  quoted: ["escape-quotes"],
  comment: ["escape-quotes", "strip-comments"],
  numeric: ["type-cast"],
};

const state = {
  defences: [],
  payloadId: "classic",
  audited: false,
  passed: false,
};

function $(id) {
  return document.getElementById(id);
}

function applyTheme() {
  const theme = new URLSearchParams(location.search).get("theme");
  if (theme === "dark" || theme === "light") {
    document.documentElement.dataset.theme = theme;
  }
}

function isBlocked(payload, defences) {
  if (defences.includes("parameterize")) return true;
  return REQUIREMENT[payload.kind].some((defence) => defences.includes(defence));
}

function currentPayload() {
  return PAYLOADS.find((item) => item.id === state.payloadId) ?? PAYLOADS[0];
}

function renderDefences() {
  const container = $("defences");
  container.innerHTML = "";
  for (const defence of DEFENCES) {
    const label = document.createElement("label");
    label.className = "defence";
    const checked = state.defences.includes(defence.id);
    label.innerHTML = `
      <input type="checkbox" value="${defence.id}" ${checked ? "checked" : ""} />
      <span>
        <strong>${defence.title}</strong>
        <span>${defence.description}</span>
      </span>`;
    const input = label.querySelector("input");
    input.addEventListener("change", () => {
      if (input.checked) {
        if (!state.defences.includes(defence.id)) state.defences.push(defence.id);
      } else {
        state.defences = state.defences.filter((id) => id !== defence.id);
      }
      state.audited = false;
      renderResults();
      renderQuery();
      track("defence_toggled", { defence: defence.id, enabled: input.checked });
      persist();
    });
    container.appendChild(label);
  }
}

function renderPayloads() {
  const container = $("payloads");
  container.innerHTML = "";
  for (const payload of PAYLOADS) {
    const label = document.createElement("label");
    label.className = "payload";
    label.innerHTML = `
      <input type="radio" name="payload" value="${payload.id}" ${
        state.payloadId === payload.id ? "checked" : ""
      } />
      <span>
        <strong><code>${escapeHtml(payload.label)}</code></strong>
        <span>注入点：${payload.context}</span>
      </span>`;
    label.querySelector("input").addEventListener("change", () => {
      state.payloadId = payload.id;
      state.audited = false;
      renderResults();
      renderQuery();
      track("payload_selected", { payloadId: payload.id });
      persist();
    });
    container.appendChild(label);
  }
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderQuery() {
  const payload = currentPayload();
  const parameterized = state.defences.includes("parameterize");
  const preview = $("query-preview");

  if (parameterized) {
    preview.textContent =
      "SELECT id, password_hash\n  FROM users\n WHERE email = $1;\n\n-- 参数 1 = " +
      JSON.stringify(payload.label);
    $("query-note").textContent =
      "参数化：SQL 结构在绑定参数之前就已固定，载荷不会参与语法解析。";
  } else {
    const column = payload.kind === "numeric" ? "id" : "email";
    const quoted = payload.kind === "numeric" ? payload.label : `'${payload.label}'`;
    preview.textContent =
      `SELECT id, password_hash\n  FROM users\n WHERE ${column} = ${quoted};`;
    $("query-note").textContent =
      "字符串拼接：用户输入直接进入 SQL 文本，可能改变查询结构。";
  }
}

function renderResults() {
  const list = $("results");
  const badge = $("audit-state");
  list.innerHTML = "";

  if (!state.audited) {
    list.innerHTML =
      '<li class="empty">点击「运行安全审计」查看每个载荷是否被阻止。</li>';
    badge.textContent = "尚未运行";
    return;
  }

  badge.textContent = "已运行";
  for (const payload of PAYLOADS) {
    const blocked = isBlocked(payload, state.defences);
    const item = document.createElement("li");
    item.className = "result-item";
    item.innerHTML = `
      <span><code>${escapeHtml(payload.label)}</code><br /><span class="mono" style="font-size:11px;color:var(--muted)">${payload.context}</span></span>
      <span class="result-status ${blocked ? "blocked" : "open"}">${
        blocked ? "已阻止" : "可绕过"
      }</span>`;
    list.appendChild(item);
  }
}

async function persist() {
  if (!SDK) return;
  try {
    await SDK.saveState({ ...state });
  } catch (error) {
    console.warn("state save failed", error);
  }
}

function track(type, payload) {
  if (!SDK) return;
  SDK.track(type, payload);
}

function renderAll() {
  renderDefences();
  renderPayloads();
  renderQuery();
  renderResults();
  updateButtons();
}

function updateButtons() {
  $("run").disabled = !state.audited ? false : false;
  $("submit").disabled = !state.audited || state.passed;
}

function setupHandlers() {
  $("run").addEventListener("click", () => {
    state.audited = true;
    renderResults();
    updateButtons();
    track("audit_run", {
      defences: [...state.defences],
      blocked: PAYLOADS.filter((p) => isBlocked(p, state.defences)).length,
    });
    void persist();
  });

  $("submit").addEventListener("click", async () => {
    const button = $("submit");
    button.disabled = true;
    button.textContent = "正在提交…";
    try {
      const result = await SDK.submit({ defences: state.defences });
      const feedback = $("feedback");
      feedback.hidden = false;
      feedback.className = "feedback " + (result.passed ? "pass" : "fail");
      feedback.textContent =
        (result.feedback && result.feedback.message) ||
        (result.passed ? "服务端验证通过。" : "服务端验证未通过。");

      if (result.passed) {
        state.passed = true;
        $("server-badge").textContent = "✓ 服务端已验证";
        $("server-badge").style.color = "var(--ok)";
        $("server-badge").style.borderColor = "var(--ok)";
        track("audit_passed", { defences: [...state.defences] });
        await SDK.complete("audit");
        await persist();
      } else {
        track("audit_failed", { defences: [...state.defences] });
      }
    } catch (error) {
      const feedback = $("feedback");
      feedback.hidden = false;
      feedback.className = "feedback fail";
      feedback.textContent = "提交失败：" + (error && error.message ? error.message : "未知错误");
    } finally {
      button.textContent = "提交审计结论";
      updateButtons();
    }
  });
}

function restore(saved) {
  if (saved && typeof saved === "object") {
    if (Array.isArray(saved.defences)) {
      state.defences = saved.defences.filter((id) =>
        DEFENCES.some((defence) => defence.id === id),
      );
    }
    if (PAYLOADS.some((payload) => payload.id === saved.payloadId)) {
      state.payloadId = saved.payloadId;
    }
    state.audited = Boolean(saved.audited);
    state.passed = Boolean(saved.passed);
  }
  renderAll();
  if (state.passed) {
    $("server-badge").textContent = "✓ 服务端已验证";
    $("server-badge").style.color = "var(--ok)";
    $("server-badge").style.borderColor = "var(--ok)";
  }
}

applyTheme();
setupHandlers();
renderAll();

if (SDK) {
  SDK.onRestore((saved) => {
    restore(saved);
    SDK.start();
  });
}
