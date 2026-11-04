import { fmtMoney, METHOD_LABEL } from '../lib/format'

/**
 * Resumen de una caja: efectivo esperado y ventas por medio de pago.
 * `summary` es lo que devuelve cash_session_summary / close_cash_session.
 * Si tiene counted_cash, muestra también el arqueo (contado y diferencia).
 */
export default function ResumenCaja({ summary }) {
  const by = summary.by_method || {}
  const others = Object.entries(by).filter(([m]) => m !== 'efectivo')
  const hasCount = summary.counted_cash !== undefined && summary.counted_cash !== null

  return (
    <div className="resumen">
      <h3>💵 Efectivo</h3>
      <dl className="rows">
        <Row label="Efectivo inicial" value={summary.opening_amount} />
        <Row label="Ventas en efectivo" value={summary.cash_sales} sign="+" />
        {Number(summary.cash_in) > 0 && <Row label="Ingresos" value={summary.cash_in} sign="+" />}
        {Number(summary.cash_out) > 0 && <Row label="Retiros / gastos" value={summary.cash_out} sign="−" />}
        <Row label="Debería haber" value={summary.expected_cash} strong />
        {hasCount && (
          <>
            <Row label="Contado" value={summary.counted_cash} strong />
            <DiffRow diff={Number(summary.difference)} />
          </>
        )}
      </dl>

      <h3>🧾 Ventas</h3>
      <dl className="rows">
        <Row label={`Total vendido (${summary.sales_count} ${summary.sales_count === 1 ? 'venta' : 'ventas'})`} value={summary.total_sales} strong />
        {Number(summary.cash_sales) > 0 && <Row label="Efectivo" value={summary.cash_sales} />}
        {others.map(([m, v]) => (
          <Row key={m} label={METHOD_LABEL[m] || m} value={v} />
        ))}
      </dl>
    </div>
  )
}

function Row({ label, value, sign, strong }) {
  return (
    <div className={strong ? 'strong' : ''}>
      <dt>{label}</dt>
      <dd>
        {sign ? `${sign} ` : ''}
        {fmtMoney(value)}
      </dd>
    </div>
  )
}

export function DiffRow({ diff }) {
  const cls = diff === 0 ? 'pos' : diff < 0 ? 'neg' : 'warn'
  const label = diff === 0 ? 'Diferencia' : diff < 0 ? 'Faltante' : 'Sobrante'
  return (
    <div className={`strong ${cls}`}>
      <dt>{label}</dt>
      <dd>{diff === 0 ? '✔ Da justo' : fmtMoney(Math.abs(diff))}</dd>
    </div>
  )
}
