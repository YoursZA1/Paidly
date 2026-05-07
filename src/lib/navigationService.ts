type NavigateOptions = {
  replace?: boolean;
  hardReload?: boolean;
};

export function navigateTo(url: string, options: NavigateOptions = {}) {
  if (typeof window === "undefined") return;
  const replace = Boolean(options.replace);
  const hardReload = Boolean(options.hardReload);

  if (hardReload) {
    if (replace) window.location.replace(url);
    else window.location.assign(url);
    return;
  }

  // Current fallback stays location-based. A router adapter can call this API with hardReload=false.
  if (replace) window.location.replace(url);
  else window.location.assign(url);
}
