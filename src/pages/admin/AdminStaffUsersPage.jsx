import UsersPage from "@/pages/UsersPage";

/** Platform staff only — not the customer user directory. */
export default function AdminStaffUsersPage() {
  return <UsersPage staffOnly />;
}
