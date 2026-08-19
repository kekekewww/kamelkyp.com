import { NavLink } from "react-router";

const navigation = [
  ["/admin/content", "內容"],
  ["/admin/services", "服務與價格"],
  ["/admin/terms", "條款"],
  ["/admin/works", "作品與媒體"],
  ["/admin/links", "連結與 Footer"],
  ["/admin/posts", "Blog"],
  ["/admin/cases", "案件"],
] as const;

export function AdminShell({
  displayName,
  children,
}: {
  displayName: string;
  children: React.ReactNode;
}) {
  return (
    <main className="admin-shell" id="main-content">
      <aside className="admin-shell__sidebar">
        <p className="eyebrow">KAMEL / ADMIN</p>
        <p>登入：{displayName}</p>
        <nav aria-label="後台導覽">
          {navigation.map(([to, label]) => (
            <NavLink key={to} to={to}>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <section className="admin-shell__main">{children}</section>
    </main>
  );
}
