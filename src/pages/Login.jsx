import Home from "./Home";

/** Same marketing shell as /Home; modal opens on Log In click or #sign-in (e.g. after RequireAuth). */
export default function Login() {
  return <Home navActive="login" />;
}
