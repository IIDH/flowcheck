import MonthPicker from './MonthPicker'

export default function PageHead({ eyebrow, title, accent, lead, picker = true, children }) {
  return (
    <div className="page-head">
      <div>
        <span className="pill dc-mono"><span className="pill-dot" />{eyebrow}</span>
        <h1 className="page-title">
          {title} {accent && <span className="grad">{accent}</span>}
        </h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
        {children}
        {picker && <MonthPicker />}
      </div>
    </div>
  )
}
