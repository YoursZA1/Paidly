import React from "react";
import styledModule from "styled-components";

const styled = styledModule.default || styledModule;

const Page = styled.div`
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  font-size: 12px;
  color: #0f172a;
  max-width: 720px;
  margin: 0 auto;
  padding: 40px;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 12px;
  margin-bottom: 24px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 20px;
  font-weight: 600;
  color: #ea580c;
  text-transform: uppercase;
  letter-spacing: -0.02em;
`;

const Meta = styled.div`
  text-align: right;
  font-size: 10px;
  color: #64748b;
`;

const Section = styled.section`
  margin-bottom: 32px;
`;

const Label = styled.p`
  margin: 0 0 0.25rem;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #94a3b8;
`;

const Table = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
`;

const Th = styled.th`
  text-align: left;
  padding: 10px 12px;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  font-size: 11px;
  text-transform: uppercase;
`;

const Td = styled.td`
  padding: 8px 12px;
  line-height: 16px;
  border: 1px solid #e2e8f0;
`;

const TotalBar = styled.div`
  margin-top: 24px;
  padding: 10px 14px;
  background: #0f172a;
  color: #fff;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const TotalLabel = styled.span`
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #94a3b8;
`;

const TotalAmount = styled.strong`
  font-size: 18px;
  font-weight: 600;
`;

export default function DocumentTemplate({ docType = "invoice" }) {
  const isQuote = docType === "quote";
  const title = isQuote ? "Quote" : "Invoice";
  const refPrefix = isQuote ? "QUO" : "INV";
  const dateLabel = isQuote ? "Valid until" : "Due";
  const totalLabel = isQuote ? "Total quote" : "Amount due";

  return (
    <Page className="invoice-root">
      <Header>
        <div>
          <Title>{title}</Title>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 12 }}>Acme Pty Ltd</p>
        </div>
        <Meta className="page-break">
          <div>
            <strong>#</strong> {refPrefix}-1001
          </div>
          <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600 }}>
            {dateLabel} {isQuote ? "15 Apr 2026" : "31 Mar 2026"}
          </div>
        </Meta>
      </Header>

      <Section className="page-break">
        <Label>{isQuote ? "Quote for" : "Bill to"}</Label>
        <p style={{ margin: 0, fontWeight: 700, fontSize: 12 }}>Client Name</p>
        <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 12 }}>client@example.com</p>
      </Section>

      <Section>
        <Table>
          <thead>
            <tr>
              <Th>Description</Th>
              <Th style={{ width: 64, textAlign: "center" }}>Qty</Th>
              <Th style={{ textAlign: "right", width: 100 }}>Price</Th>
              <Th style={{ textAlign: "right", width: 100 }}>Total</Th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <Td>{isQuote ? "Proposed professional services" : "Professional services"}</Td>
              <Td style={{ textAlign: "center" }}>1</Td>
              <Td style={{ textAlign: "right" }}>R 1 000.00</Td>
              <Td style={{ textAlign: "right", fontWeight: 700 }}>R 1 000.00</Td>
            </tr>
          </tbody>
        </Table>
      </Section>

      <TotalBar className="page-break">
        <TotalLabel>{totalLabel}</TotalLabel>
        <TotalAmount>R 1 000.00</TotalAmount>
      </TotalBar>
    </Page>
  );
}
