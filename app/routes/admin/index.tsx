const sections = [
  "內容",
  "服務與價格",
  "條款",
  "作品與媒體",
  "連結與 Footer",
  "案件",
  "待清理資料",
];

export default function AdminIndex() {
  return (
    <section>
      <p className="eyebrow">OVERVIEW</p>
      <h1>管理後台</h1>
      <ul>
        {sections.map((section) => (
          <li key={section}>{section}</li>
        ))}
      </ul>
    </section>
  );
}
