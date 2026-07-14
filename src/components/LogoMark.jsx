import meshLogo from "../assets/brand/mesh.png";

export default function LogoMark({ compact = false }) {
  return (
    <div className={`logo-lockup ${compact ? "compact" : ""}`}>
      <img className="logo-mark" src={meshLogo} alt="" aria-hidden="true" />
      {!compact && (
        <div>
          <div className="brand-title">AGIL Mesh</div>
          <div className="brand-subtitle">Mesh Console</div>
        </div>
      )}
    </div>
  );
}
