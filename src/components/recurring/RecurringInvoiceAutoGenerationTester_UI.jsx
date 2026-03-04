import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Play, 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Copy,
  Download,
  AlertCircle
} from 'lucide-react';
import RecurringInvoiceAutoGenerationTester from '../../services/RecurringInvoiceAutoGenerationTester';

const RecurringInvoiceAutoGenerationTester_UI = () => {
  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState(null);
  const [error, setError] = useState('');

  const handleRunTests = async () => {
    setIsRunning(true);
    setError('');
    setTestResults(null);

    try {
      const results = await RecurringInvoiceAutoGenerationTester.runAllTests();
      setTestResults(results);
    } catch (err) {
      setError(err.message || 'Failed to run tests');
      console.error('Test error:', err);
    } finally {
      setIsRunning(false);
    }
  };

  const downloadReport = () => {
    if (!testResults) return;

    const dataStr = JSON.stringify(testResults, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `recurring-invoice-tests-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const copyToClipboard = () => {
    if (!testResults) return;
    
    const text = JSON.stringify(testResults, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      alert('Test results copied to clipboard');
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Auto-Generation Testing</h2>
        <p className="text-gray-600">Test recurring invoice automatic generation, scheduling, and data accuracy</p>
      </div>

      {/* Error Alert */}
      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-700">{error}</AlertDescription>
        </Alert>
      )}

      {/* Control Panel */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Test Control Panel</CardTitle>
          <CardDescription>Run comprehensive auto-generation tests</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3">
            <Button
              onClick={handleRunTests}
              disabled={isRunning}
              className="w-full bg-primary hover:bg-primary/90"
              size="lg"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Running Tests...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run All Tests
                </>
              )}
            </Button>

            {testResults && (
              <div className="flex gap-2">
                <Button
                  onClick={copyToClipboard}
                  variant="outline"
                  className="flex-1"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Results
                </Button>
                <Button
                  onClick={downloadReport}
                  variant="outline"
                  className="flex-1"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download JSON
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Results Summary */}
      {testResults && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center justify-between">
                <span>Test Summary</span>
                <Badge className={testResults.failedTests === 0 ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}>
                  {testResults.successRate}% Success Rate
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-sm text-gray-600 mb-1">Total Tests</p>
                  <p className="text-3xl font-bold">{testResults.totalTests}</p>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-sm text-green-600 mb-1">Passed</p>
                  <p className="text-3xl font-bold text-green-600">{testResults.passedTests}</p>
                </div>
                <div className={`p-4 rounded-lg ${testResults.failedTests > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
                  <p className={`text-sm mb-1 ${testResults.failedTests > 0 ? 'text-red-600' : 'text-gray-600'}`}>
                    Failed
                  </p>
                  <p className={`text-3xl font-bold ${testResults.failedTests > 0 ? 'text-red-600' : 'text-gray-900'}`}>
                    {testResults.failedTests}
                  </p>
                </div>
              </div>
              <p className="text-sm text-gray-500 mt-4">
                Tested at: {new Date(testResults.timestamp).toLocaleString()}
              </p>
            </CardContent>
          </Card>

          {/* Individual Test Results */}
          <div className="space-y-3">
            {testResults.results.map((result, idx) => (
              <Card key={idx} className={result.passed ? 'border-green-200' : 'border-red-200'}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      {result.passed ? (
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                      {result.test}
                    </CardTitle>
                    <Badge className={result.passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                      {result.passed ? 'PASSED' : 'FAILED'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {result.details.length > 0 && (
                    <div className="space-y-1">
                      {result.details.map((detail, i) => (
                        <p key={i} className="text-sm text-gray-700">
                          {detail}
                        </p>
                      ))}
                    </div>
                  )}

                  {result.errors.length > 0 && (
                    <div className="space-y-1 pt-2 border-t">
                      {result.errors.map((error, i) => (
                        <p key={i} className="text-sm text-red-600">
                          {error}
                        </p>
                      ))}
                    </div>
                  )}

                  {result.generatedInvoices && result.generatedInvoices.length > 0 && (
                    <div className="pt-2 border-t">
                      <p className="text-sm font-medium text-gray-700 mb-1">Generated Invoices:</p>
                      <div className="space-y-1">
                        {result.generatedInvoices.map((id, i) => (
                          <p key={i} className="text-sm text-gray-600">
                            • {id}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.generatedCount !== undefined && (
                    <div className="pt-2 border-t">
                      <p className="text-sm font-medium text-gray-700">
                        Invoices Generated: <span className="text-primary">{result.generatedCount}</span>
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Detailed Results JSON */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Full Test Report (JSON)</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="bg-gray-50 p-4 rounded text-xs overflow-auto max-h-96 border">
                {JSON.stringify(testResults, null, 2)}
              </pre>
            </CardContent>
          </Card>
        </>
      )}

      {/* Info Card */}
      {!testResults && !isRunning && (
        <Card className="border-primary/20 bg-primary/10">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-primary" />
              About These Tests
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-gray-700">
            <p>
              <strong>Test 1:</strong> Verifies that isDue() correctly identifies templates ready for generation
            </p>
            <p>
              <strong>Test 2:</strong> Validates next generation date calculations for all frequency types
            </p>
            <p>
              <strong>Test 3:</strong> Ensures invoices are generated correctly from templates with proper data
            </p>
            <p>
              <strong>Test 4:</strong> Tests batch generation of multiple due invoices
            </p>
            <p>
              <strong>Test 5:</strong> Verifies paused templates are protected from generation
            </p>
            <p>
              <strong>Test 6:</strong> Verifies ended templates are protected from generation
            </p>
            <p>
              <strong>Test 7:</strong> Tests frequency calculations for all cycle types (weekly, monthly, annual, etc.)
            </p>
            <p>
              <strong>Test 8:</strong> Validates generated invoices have correct financial data and tax calculations
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default RecurringInvoiceAutoGenerationTester_UI;
