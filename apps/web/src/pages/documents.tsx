import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { Button, Card, CardContent, CardHeader, Empty } from "../components/ui";
import { api, downloadPdf } from "../lib/api";
import { dateTime } from "../lib/utils";
import type { BusinessDocument } from "../types";

const labels: Record<string, string> = { SALE_RECEIPT: "Recibo de venta", SALE_WARRANTY: "Garantía de venta", REPAIR_INTAKE: "Ticket de recepción", REPAIR_RECEIPT: "Recibo de reparación", REPAIR_WARRANTY: "Garantía de reparación", PAYMENT_RECEIPT: "Comprobante de abono" };
export function DocumentsPage() {
  const { data = [] } = useQuery({ queryKey: ["documents"], queryFn: () => api<BusinessDocument[]>("/documents") });
  return <div className="space-y-6"><div><h1 className="page-title">Documentos</h1><p className="mt-1 text-sm text-muted-foreground">Comprobantes y garantías generados desde operaciones reales.</p></div><Card><CardHeader title="Historial documental" description={`${data.length} documentos`} /><CardContent>{data.length ? <div className="overflow-auto"><table className="data-table"><thead><tr><th>Número</th><th>Documento</th><th>Origen</th><th>Emisión</th><th>Vencimiento</th><th></th></tr></thead><tbody>{data.map((document) => <tr key={document.id}><td>ST-{String(document.number).padStart(6, "0")}</td><td>{labels[document.type] ?? document.type}</td><td>{document.sourceType}</td><td>{dateTime(document.createdAt)}</td><td>{document.warrantyEnd ? new Date(document.warrantyEnd).toLocaleDateString("es-HN") : "—"}</td><td><Button size="sm" variant="outline" onClick={() => downloadPdf(`/documents/${document.id}/pdf`, `servi-techno-${document.number}.pdf`)}><Download size={15} /> PDF</Button></td></tr>)}</tbody></table></div> : <Empty>Aún no hay documentos emitidos.</Empty>}</CardContent></Card></div>;
}
