/**
 * Demo invoice markup for Anvil PDF via React SSR + styled-components.
 * Extend or replace with props/data wired from your app.
 */
import React from "react";
import styledModule from "styled-components";

const styled = styledModule.default || styledModule;

const Page = styled.div`
  font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
  font-size: 14px;
  color: #0f172a;
  max-width: 720px;
`;

const Header = styled.header`
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  border-bottom: 2px solid #e2e8f0;
  padding-bottom: 1rem;
  margin-bottom: 1.5rem;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 1.75rem;
  font-weight: 800;
  color: #ea580c;
  text-transform: uppercase;
  letter-spacing: -0.02em;
`;

const Meta = styled.div`
  text-align: right;
  font-size: 12px;
  color: #64748b;
`;

const Section = styled.section`
  margin-bottom: 1.5rem;
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
  font-size: 13px;
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
  padding: 12px;
  border: 1px solid #e2e8f0;
`;

const TotalBar = styled.div`
  margin-top: 1.5rem;
  padding: 1rem 1.25rem;
  background: #0f172a;
  color: #fff;
  border-radius: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
`;

const TotalLabel = styled.span`
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: #94a3b8;
`;

const TotalAmount = styled.strong`
  font-size: 1.75rem;
  font-weight: 800;
`;

export default function Invoice() {
  return (
    <Page>
      <Header>
        <div>
          <Title>Invoice</Title>
          <p style={{ margin: "0.5rem 0 0", color: "#64748b", fontSize: 13 }}>Acme Pty Ltd</p>
        </div>
        <Meta>
          <div>
            <strong>#</strong> INV-1001
          </div>
          <div style={{ marginTop: 8 }}>Due 31 Mar 2026</div>
        </Meta>
      </Header>

      <Section>
        <Label>Bill to</Label>
        <p style={{ margin: 0, fontWeight: 700 }}>Client Name</p>
        <p style={{ margin: "4px 0 0", color: "#64748b" }}>client@example.com</p>
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
              <Td>Professional services</Td>
              <Td style={{ textAlign: "center" }}>1</Td>
              <Td style={{ textAlign: "right" }}>R 1 000.00</Td>
              <Td style={{ textAlign: "right", fontWeight: 700 }}>R 1 000.00</Td>
            </tr>
          </tbody>
        </Table>
      </Section>

      <TotalBar>
        <TotalLabel>Amount due</TotalLabel>
        <TotalAmount>R 1 000.00</TotalAmount>
      </TotalBar>
    </Page>
  );
}
