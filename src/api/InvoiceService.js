/**
 * Invoice Service - Handles PDF generation, download, email, and sharing
 */

import { breakApi } from './apiClient';

class InvoiceService {
  /**
   * Generate PDF from invoice data
   */
  static async generatePDF(invoice) {
    try {
      void invoice; // Acknowledge parameter
      const pdfUrl = this.getInvoicePdfUrl(invoice.id);
      return pdfUrl;
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      throw error;
    }
  }

  /**
   * Download invoice as PDF
   */
  static downloadInvoicePDF(invoiceId, invoiceNumber = 'invoice') {
    try {
      const pdfUrl = this.getInvoicePdfUrl(invoiceId, true);
      window.open(pdfUrl, '_blank');
      return true;
    } catch (error) {
      console.error('Failed to download PDF:', error);
      throw error;
    }
  }

  /**
   * Get invoice PDF URL for printing
   */
  static getInvoicePdfUrl(invoiceId, download = false) {
    const baseUrl = window.location.origin;
    const pdfPage = `${baseUrl}/InvoicePDF?id=${invoiceId}`;
    if (download) {
      return `${pdfPage}&download=true`;
    }
    return pdfPage;
  }

  /**
   * Preview invoice PDF in same tab
   */
  static previewInvoicePDF(invoiceId) {
    try {
      const pdfUrl = this.getInvoicePdfUrl(invoiceId);
      window.location.href = pdfUrl;
      return true;
    } catch (error) {
      console.error('Failed to preview PDF:', error);
      throw error;
    }
  }

  /**
   * Print invoice
   */
  static printInvoice(invoiceId) {
    try {
      const pdfUrl = this.getInvoicePdfUrl(invoiceId);
      const printWindow = window.open(pdfUrl, '_blank');
      if (printWindow) {
        printWindow.addEventListener('load', () => {
          setTimeout(() => {
            printWindow.print();
          }, 250);
        });
      }
      return true;
    } catch (error) {
      console.error('Failed to print invoice:', error);
      throw error;
    }
  }

  /**
   * Send invoice via email
   */
  static async sendInvoiceEmail(
    invoiceData,
    clientEmail,
    clientName,
    companyName,
    invoiceNumber,
    customMessage = ''
  ) {
    try {
      const baseUrl = window.location.origin;
      const publicViewUrl = `${baseUrl}/PublicInvoice?id=${invoiceData.id}`;
      const pdfUrl = `${baseUrl}/InvoicePDF?id=${invoiceData.id}`;

      const emailSubject = `Invoice #${invoiceNumber} from ${companyName}`;

      const emailBody = this.generateEmailTemplate(
        clientName,
        companyName,
        invoiceNumber,
        publicViewUrl,
        pdfUrl,
        customMessage
      );

      // Use the custom client's SendEmail method
      await breakApi.integrations.Core.SendEmail({
        to: clientEmail,
        subject: emailSubject,
        body: emailBody
      });

      return {
        success: true,
        message: `Invoice sent to ${clientEmail} successfully!`
      };
    } catch (error) {
      console.error('Failed to send email:', error);
      throw new Error(`Failed to send invoice email: ${error.message}`);
    }
  }

  /**
   * Generate email template
   */
  static generateEmailTemplate(
    clientName,
    companyName,
    invoiceNumber,
    publicViewUrl,
    pdfUrl,
    customMessage = ''
  ) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8">
          <style>
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              background-color: #f9fafb;
              margin: 0;
              padding: 0;
            }
            .email-container {
              max-width: 600px;
              margin: 20px auto;
              background-color: #ffffff;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
            }
            .email-header {
              background: linear-gradient(135deg, #f24e00 0%, #ff7c00 100%);
              color: white;
              padding: 30px;
              text-align: center;
              border-radius: 8px 8px 0 0;
            }
            .email-header h1 {
              margin: 0;
              font-size: 24px;
              font-weight: 600;
            }
            .email-body {
              padding: 30px;
            }
            .email-body p {
              margin: 0 0 15px 0;
              color: #374151;
              line-height: 1.6;
            }
            .invoice-details {
              background-color: #f3f4f6;
              padding: 20px;
              border-radius: 6px;
              margin: 20px 0;
            }
            .invoice-details p {
              margin: 8px 0;
              font-size: 14px;
            }
            .button-group {
              display: flex;
              gap: 12px;
              margin: 30px 0;
              flex-wrap: wrap;
            }
            .button {
              flex: 1;
              min-width: 200px;
              padding: 12px 24px;
              text-align: center;
              text-decoration: none;
              border-radius: 6px;
              font-weight: 600;
              transition: background-color 0.3s ease;
              display: inline-block;
            }
            .button-primary {
              background-color: #f24e00;
              color: white;
            }
            .button-primary:hover {
              background-color: #e04500;
            }
            .button-secondary {
              background-color: #10b981;
              color: white;
            }
            .button-secondary:hover {
              background-color: #059669;
            }
            .custom-message {
              background-color: #fef3c7;
              border-left: 4px solid #f59e0b;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .custom-message p {
              margin: 0;
              color: #92400e;
            }
            .email-footer {
              border-top: 1px solid #e5e7eb;
              padding: 20px;
              text-align: center;
              color: #6b7280;
              font-size: 12px;
              background-color: #f9fafb;
              border-radius: 0 0 8px 8px;
            }
            .company-name {
              font-weight: 600;
              color: #111827;
            }
          </style>
        </head>
        <body>
          <div class="email-container">
            <div class="email-header">
              <h1>Invoice from <span class="company-name">${companyName}</span></h1>
            </div>

            <div class="email-body">
              <p>Hello <strong>${clientName}</strong>,</p>
              
              <p>We're pleased to send you Invoice <strong>#${invoiceNumber}</strong>. Please review the details below and let us know if you have any questions.</p>

              <div class="invoice-details">
                <p><strong>Invoice Number:</strong> ${invoiceNumber}</p>
                <p><strong>From:</strong> ${companyName}</p>
                <p><strong>Date Sent:</strong> ${new Date().toLocaleDateString()}</p>
              </div>

              ${
                customMessage
                  ? `<div class="custom-message">
                      <p>${customMessage}</p>
                    </div>`
                  : ''
              }

              <div class="button-group">
                <a href="${publicViewUrl}" class="button button-primary">
                  View Invoice Online
                </a>
                <a href="${pdfUrl}" class="button button-secondary">
                  Download PDF
                </a>
              </div>

              <p>Thank you for your business!</p>
              <p>Best regards,<br><strong>${companyName}</strong></p>
            </div>

            <div class="email-footer">
              <p>This is an automated email from Paidly. Please do not reply to this email.</p>
              <p>&copy; ${new Date().getFullYear()} ${companyName}. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * Generate shareable public link for invoice
   */
  static generatePublicShareLink(invoiceId, shareToken) {
    const baseUrl = window.location.origin;
    return `${baseUrl}/PublicInvoice?token=${shareToken}`;
  }

  /**
   * Export invoice as JSON
   */
  static exportInvoiceJSON(invoice, client, user) {
    try {
      const exportData = {
        invoice: invoice,
        client: client,
        company: user,
        exportedAt: new Date().toISOString()
      };

      const dataStr = JSON.stringify(exportData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Invoice-${invoice.invoice_number}-${new Date().getTime()}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return true;
    } catch (error) {
      console.error('Failed to export JSON:', error);
      throw error;
    }
  }

  /**
   * Export invoice as CSV
   */
  static exportInvoiceCSV(invoice, client) {
    try {
      const headers = [
        'Invoice Number',
        'Date',
        'Client Name',
        'Client Email',
        'Amount',
        'Status',
        'Due Date'
      ];

      const values = [
        invoice.invoice_number,
        new Date(invoice.created_at).toLocaleDateString(),
        client.name,
        client.email,
        invoice.total_amount,
        invoice.status,
        new Date(invoice.due_date).toLocaleDateString()
      ];

      const csvContent = [
        headers.join(','),
        values.join(',')
      ].join('\n');

      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Invoice-${invoice.invoice_number}-${new Date().getTime()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return true;
    } catch (error) {
      console.error('Failed to export CSV:', error);
      throw error;
    }
  }

  /**
   * Copy shareable link to clipboard
   */
  static copyToClipboard(text) {
    try {
      if (navigator.clipboard) {
        navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      return true;
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      throw error;
    }
  }
}

export default InvoiceService;
