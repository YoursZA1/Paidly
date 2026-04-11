import React from "react";
import ApplicationErrorPage from "@/pages/ApplicationErrorPage.jsx";
import { logUnhandledError, getCurrentPage } from "@/utils/apiLogger";
import { PAIDLY_APPLICATION_ERROR_EVENT } from "@/utils/globalAsyncErrorHandlers";

/**
 * Root error boundary: React render errors + {@link PAIDLY_APPLICATION_ERROR_EVENT} from global async handlers.
 * Wrap the tree inside ThemeProvider so recovery UI has correct tokens.
 */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidMount() {
    this._onApplicationError = (e) => {
      const err = e?.detail?.error;
      if (!(err instanceof Error)) return;
      this.setState({ hasError: true, error: err });
    };
    window.addEventListener(PAIDLY_APPLICATION_ERROR_EVENT, this._onApplicationError);
  }

  componentWillUnmount() {
    window.removeEventListener(PAIDLY_APPLICATION_ERROR_EVENT, this._onApplicationError);
  }

  componentDidCatch(error, info) {
    logUnhandledError(error, getCurrentPage());
    console.error("App crash:", error, info);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ApplicationErrorPage error={this.state.error} onReset={this.handleReset} />
      );
    }

    return this.props.children;
  }
}
