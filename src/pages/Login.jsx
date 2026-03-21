import Home from "./Home";

/** Same marketing shell as /Home; login modal opens automatically on /Login, /Auth, /login (and #sign-in). */
export default function Login() {
  return <Home navActive="login" defaultLoginOpen />;
}
