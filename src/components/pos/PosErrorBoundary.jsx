import React from "react";
import { captureException } from "@/lib/sentry";
import { PosLoadError } from "@/components/pos/PosShellStates";

/**
 * POS-only recovery. The root app boundary still catches dashboard crashes;
 * this one must never leave /pos as a blank document.
 */
export default class PosErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    captureException(error, { componentStack: info?.componentStack, tags: { surface: "pos" } });
    console.error("POS crash:", error, info);
  }

  handleRetry = () => {
    this.setState({ error: null });
    if (typeof this.props.onRetry === "function") this.props.onRetry();
  };

  render() {
    if (this.state.error) {
      return (
        <PosLoadError
          error={this.state.error}
          onRetry={this.handleRetry}
        />
      );
    }
    return this.props.children;
  }
}
