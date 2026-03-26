import Home from "./Home";

/** Same marketing shell as /Home; sign-in modal now opens only on explicit user action. */
export default function Login() {
  return <Home navActive="login" />;
}
