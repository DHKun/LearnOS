/* Idempotency / retry lab — local simulation mirrors the server validator. */

const SDK = window.LearningSDK;

const KEY_STRATEGIES = [
  {
    id: "stable",
    title: "按业务操作生成稳定键",
    description: "点击支付时生成一次，写入本地状态；所有重试复用同一个键。",
  },
  {
    id: "random",
    title: "每次请求生成新 UUID",
    description: "实现简单，但每次重试看起来都是新的业务操作。",
  },
  {
    id: "none",
    title: "不发送幂等键",
    description: "服务端只能把每个请求当成独立操作。",
  },
];

const RETRY_POLICIES = [
  {
    id: "same-key",
    title: "重试复用同一个键",
    description: "正确的做法：键随业务操作走，不随网络重试变化。",
  },
  {
    id: "new-key",
    title: "重试时重新生成键",
    description: "去重表会把重试当成新操作，导致重复副作用。",
  },
];

const FAULTS = 3;

const state = {
  keyStrategy: "random",
  retryPolicy: "new-key",
  dedupe: false,
  maxRetries: 2,
  ran: false,
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

function simulate() {
  const attempts = Math.min(state.maxRetries, FAULTS) + 1;
  const stableKey = state.keyStrategy === "stable" && state.retryPolicy === "same-key";
  const effective = state.dedupe && stableKey;

  let charges = 0;
  let suppressed = 0;
  const timeline = [];

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const duplicate = effective && charges > 0;
    if (duplicate) suppressed += 1;
    else charges += 1;
    const fault = attempt <= FAULTS;
    timeline.push({
      attempt,
      outcome: fault
        ? attempt % 2 === 0
          ? "响应丢失（服务端已执行）"
          : "网关超时（结果未知）"
        : "成功返回",
      charged: !duplicate,
    });
  }

  return {
    charges,
    suppressed,
    attempts,
    timeline,
    gaveUp: state.maxRetries < FAULTS,
    effective,
  };
}

function renderChoices() {
  renderChoiceGroup("key-strategies", KEY_STRATEGIES, "keyStrategy", "key");
  renderChoiceGroup("retry-policies", RETRY_POLICIES, "retryPolicy", "retry");

  const dedupe = $("dedupe");
  dedupe.checked = state.dedupe;
  dedupe.onchange = () => {
    state.dedupe = dedupe.checked;
    state.ran = false;
    renderSimulation();
    track("dedupe_toggled", { enabled: state.dedupe });
    void persist();
  };

  const range = $("max-retries");
  range.value = String(state.maxRetries);
  $("max-retries-value").textContent = String(state.maxRetries);
  range.oninput = () => {
    state.maxRetries = Number(range.value);
    $("max-retries-value").textContent = String(state.maxRetries);
    state.ran = false;
    renderSimulation();
    void persist();
  };
}

function renderChoiceGroup(containerId, items, key, eventSuffix) {
  const container = $(containerId);
  container.innerHTML = "";
  for (const item of items) {
    const label = document.createElement("label");
    label.className = "choice";
    label.innerHTML = `
      <input type="radio" name="${key}" value="${item.id}" ${
        state[key] === item.id ? "checked" : ""
      } />
      <span>
        <strong>${item.title}</strong>
        <span>${item.description}</span>
      </span>`;
    label.querySelector("input").onchange = () => {
      state[key] = item.id;
      state.ran = false;
      renderSimulation();
      track(`${eventSuffix}_strategy_changed`, { value: item.id });
      void persist();
    };
    container.appendChild(label);
  }
}

function renderSimulation() {
  const charges = $("charges");
  const summary = $("summary");
  const timeline = $("timeline");
  const runState = $("run-state");

  if (!state.ran) {
    charges.textContent = "—";
    summary.textContent = "配置完成后运行模拟。服务端会独立重算，不信任客户端上报的数字。";
    timeline.innerHTML = "";
    runState.textContent = "尚未运行";
    return;
  }

  const result = simulate();
  charges.textContent = String(result.charges);
  charges.style.color = result.charges === 1 ? "var(--ok)" : "var(--danger)";
  runState.textContent = "已运行";
  summary.textContent = result.gaveUp
    ? `重试预算不足：${FAULTS} 次故障，最多重试 ${state.maxRetries} 次，客户端在成功前放弃。`
    : `共 ${result.attempts} 次到达服务端，抑制 ${result.suppressed} 次重复。`;
  timeline.innerHTML = result.timeline
    .map(
      (item) => `
        <li>
          <span>#${item.attempt} ${item.outcome}</span>
          <span class="${item.charged ? "ok" : "dup"}">${
            item.charged ? "扣款 +1" : "重复，已抑制"
          }</span>
        </li>`,
    )
    .join("");
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

function updateButtons() {
  $("submit").disabled = !state.ran || state.passed;
}

function setupHandlers() {
  $("run").addEventListener("click", () => {
    state.ran = true;
    renderSimulation();
    updateButtons();
    const result = simulate();
    track("retry_simulation_run", {
      keyStrategy: state.keyStrategy,
      retryPolicy: state.retryPolicy,
      dedupe: state.dedupe,
      maxRetries: state.maxRetries,
      charges: result.charges,
    });
    void persist();
  });

  $("submit").addEventListener("click", async () => {
    const button = $("submit");
    button.disabled = true;
    button.textContent = "正在提交…";
    try {
      const result = await SDK.submit({
        keyStrategy: state.keyStrategy,
        retryPolicy: state.retryPolicy,
        dedupe: state.dedupe,
        maxRetries: state.maxRetries,
      });
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
        track("retry_strategy_passed", {});
        await SDK.complete("audit");
        await persist();
      } else {
        track("retry_strategy_failed", {});
      }
    } catch (error) {
      const feedback = $("feedback");
      feedback.hidden = false;
      feedback.className = "feedback fail";
      feedback.textContent = "提交失败：" + (error && error.message ? error.message : "未知错误");
    } finally {
      button.textContent = "提交策略";
      updateButtons();
    }
  });
}

function restore(saved) {
  if (saved && typeof saved === "object") {
    if (KEY_STRATEGIES.some((item) => item.id === saved.keyStrategy)) {
      state.keyStrategy = saved.keyStrategy;
    }
    if (RETRY_POLICIES.some((item) => item.id === saved.retryPolicy)) {
      state.retryPolicy = saved.retryPolicy;
    }
    state.dedupe = Boolean(saved.dedupe);
    if (typeof saved.maxRetries === "number") {
      state.maxRetries = Math.max(0, Math.min(5, saved.maxRetries));
    }
    state.ran = Boolean(saved.ran);
    state.passed = Boolean(saved.passed);
  }
  renderChoices();
  renderSimulation();
  updateButtons();
  if (state.passed) {
    $("server-badge").textContent = "✓ 服务端已验证";
    $("server-badge").style.color = "var(--ok)";
    $("server-badge").style.borderColor = "var(--ok)";
  }
}

applyTheme();
renderChoices();
renderSimulation();
setupHandlers();

if (SDK) {
  SDK.onRestore((saved) => {
    restore(saved);
    SDK.start();
  });
}
