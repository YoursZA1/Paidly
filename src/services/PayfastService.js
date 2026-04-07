// In dev: use same origin so Vite proxy forwards /api to the backend. In production: use VITE_SERVER_URL.
const getPayfastApiBase = () => {
  if (import.meta.env.DEV) return "";
  const url = (import.meta.env.VITE_SERVER_URL || "").replace(/\/$/, "");
  // Production default should be same-origin (/api on current deployment), not localhost.
  return url;
};

const submitPayfastForm = (payfastUrl, fields) => {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = payfastUrl;
  form.style.display = "none";

  Object.entries(fields || {}).forEach(([key, value]) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = key;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  form.submit();
  document.body.removeChild(form);
};

const buildReturnUrl = (path) => {
  const base = window.location.origin;
  return `${base}${path}`;
};

const PayfastService = {
  async readApiError(response, fallbackMessage) {
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      try {
        const text = await response.text();
        if (text) payload = { error: text };
      } catch {
        payload = null;
      }
    }
    const msg =
      payload?.error ||
      payload?.message ||
      `${fallbackMessage} (HTTP ${response.status})`;
    return new Error(msg);
  },

  async startOneTimePayment({
    invoiceId,
    amount,
    currency = "ZAR",
    clientName,
    clientEmail,
    returnPath = window.location.pathname + window.location.search,
    cancelPath = window.location.pathname + window.location.search
  }) {
    const payload = {
      invoiceId,
      amount,
      currency,
      clientName,
      clientEmail,
      returnUrl: buildReturnUrl(returnPath),
      cancelUrl: buildReturnUrl(cancelPath)
    };

    let response;
    try {
      response = await fetch(`${getPayfastApiBase()}/api/payfast/once`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } catch (networkError) {
      const msg = networkError?.message || String(networkError);
      if (msg.includes("Failed to fetch") || msg.includes("Connection refused") || msg.includes("NetworkError")) {
        const hint = import.meta.env.DEV
          ? "Start the backend with: npm run server"
          : "Set VITE_SERVER_URL to your payment API and ensure the server is running";
        throw new Error(`Payment server is unavailable. ${hint}.`);
      }
      throw networkError;
    }

    if (!response.ok) {
      throw await this.readApiError(response, "Failed to start Payfast payment");
    }

    const data = await response.json();
    if (!data?.payfastUrl || !data?.fields) {
      throw new Error("Invalid Payfast response");
    }

    submitPayfastForm(data.payfastUrl, data.fields);
  },

  async startSubscription({
    subscriptionId,
    userId,
    userEmail,
    userName,
    plan,
    billingCycle,
    amount,
    currency = "ZAR",
    returnPath = "/AdminSubscriptions",
    cancelPath = "/AdminSubscriptions"
  }) {
    const payload = {
      subscriptionId,
      userId,
      userEmail,
      userName,
      plan,
      billingCycle,
      amount,
      currency,
      returnUrl: buildReturnUrl(returnPath),
      cancelUrl: buildReturnUrl(cancelPath)
    };

    let response;
    try {
      response = await fetch(`${getPayfastApiBase()}/api/payfast/subscription`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
    } catch (networkError) {
      const msg = networkError?.message || String(networkError);
      if (msg.includes("Failed to fetch") || msg.includes("Connection refused") || msg.includes("NetworkError")) {
        const hint = import.meta.env.DEV
          ? "Start the backend with: npm run server"
          : "Set VITE_SERVER_URL to your payment API and ensure the server is running";
        throw new Error(`Payment server is unavailable. ${hint}.`);
      }
      throw networkError;
    }

    if (!response.ok) {
      throw await this.readApiError(response, "Failed to start Payfast subscription");
    }

    const data = await response.json();
    if (!data?.payfastUrl || !data?.fields) {
      throw new Error("Invalid Payfast response");
    }

    submitPayfastForm(data.payfastUrl, data.fields);
  }
};

export default PayfastService;
