import { useState } from 'react';
import PropTypes from 'prop-types';
import { Button } from '@/components/ui/button';
import { Save, Send, FileText, Mail } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * InvoiceSaveActions Component
 * Provides options to save invoice as draft or send immediately
 */
export default function InvoiceSaveActions({
  onSaveDraft,
  onSendNow,
  loading = false,
  disabled = false,
  showConfirmDialog = false,
  buttonText = null,
}) {
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [actionType, setActionType] = useState('draft');

  const draftButtonText = buttonText?.draft || 'Save as Draft';
  const sendButtonText = buttonText?.send || 'Send Invoice';

  const handleAction = (type) => {
    setActionType(type);
    if (showConfirmDialog) {
      setIsConfirmOpen(true);
    } else {
      executeAction(type);
    }
  };

  const executeAction = (type) => {
    if (type === 'draft') {
      onSaveDraft();
    } else {
      onSendNow();
    }
    setIsConfirmOpen(false);
  };

  return (
    <>
      <div className="flex gap-3 justify-end">
        {/* Save as Draft Button */}
        <Button
          variant="outline"
          onClick={() => handleAction('draft')}
          disabled={disabled || loading}
          className="flex items-center gap-2 border-gray-300 hover:bg-gray-50"
        >
          <Save className="w-4 h-4" />
          <span>{draftButtonText}</span>
        </Button>

        {/* Send Now Button */}
        <Button
          onClick={() => handleAction('send')}
          disabled={disabled || loading}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Send className="w-4 h-4" />
          <span>{loading ? 'Sending...' : sendButtonText}</span>
        </Button>
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={isConfirmOpen} onOpenChange={setIsConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {actionType === 'send' ? (
                <>
                  <Mail className="w-5 h-5 text-blue-600" />
                  <span>Send Invoice Now?</span>
                </>
              ) : (
                <>
                  <FileText className="w-5 h-5 text-gray-600" />
                  <span>Save as Draft?</span>
                </>
              )}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'send' ? (
                <>
                  This invoice will be sent to the client immediately via email.
                  The client will receive a notification and can view the invoice online.
                </>
              ) : (
                <>
                  This invoice will be saved as a draft. You can continue editing
                  it later and send it when you&apos;re ready.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsConfirmOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={() => executeAction(actionType)}
              disabled={loading}
              className={actionType === 'send' ? 'bg-blue-600 hover:bg-blue-700' : ''}
            >
              {loading ? 'Processing...' : actionType === 'send' ? 'Send Now' : 'Save Draft'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

InvoiceSaveActions.propTypes = {
  onSaveDraft: PropTypes.func.isRequired,
  onSendNow: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  disabled: PropTypes.bool,
  showConfirmDialog: PropTypes.bool,
  buttonText: PropTypes.shape({
    draft: PropTypes.string,
    send: PropTypes.string,
  }),
};
