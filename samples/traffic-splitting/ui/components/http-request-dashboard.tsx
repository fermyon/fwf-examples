"use client"

import { useState, useEffect } from "react"
import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Cell, Tooltip, Legend, PieChart, Pie } from "recharts"
import { CalendarIcon, RefreshCw, AlertTriangle, Search, Copy } from "lucide-react"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Calendar } from "@/components/ui/calendar"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "@/components/ui/use-toast"
import { Input } from "@/components/ui/input"
import { LoadingSpinner } from "@/components/ui/loading-spinner"

interface HTTPRequestDashboardProps {
  appId: string
  appName: string
  appUrl: string
}

interface RequestMetadata {
  appId: string
  id: string
  timestamp: string
  url: string
  method: string
  headers: string[]
  bodyLength: number
}

interface ResponseMetadata {
  id: string;
  requestId: string;
  appId: string;
  timestamp: string;
  statusCode: number;
  headers: string[];
  bodyLength: number;
}

interface ChartDataItem {
  method: string
  count: number
}

// Add new interface for status code chart data
interface StatusCodeChartItem {
  name: string
  value: number
  color: string
}

// Add time filter options
const TIME_FILTERS = [
  { label: "5 minutes", value: "5m", ms: 5 * 60 * 1000 },
  { label: "15 minutes", value: "15m", ms: 15 * 60 * 1000 },
  { label: "1 hour", value: "1h", ms: 60 * 60 * 1000 },
  { label: "24 hours", value: "24h", ms: 24 * 60 * 60 * 1000 },
  { label: "All time", value: "all", ms: Infinity },
]

// Status code category colors
const STATUS_COLORS = {
  success: "#10b981", // Green for 2xx
  redirect: "#f59e0b", // Amber for 3xx
  clientError: "#ef4444", // Red for 4xx
  serverError: "#7f1d1d", // Dark red for 5xx
  unknown: "#6b7280", // Gray for others
}

interface FetchRequestsOptions {
  timeFilter?: string;
  limit?: number;
}

export default function HTTPRequestDashboard({ appId, appName, appUrl }: HTTPRequestDashboardProps) {
  const [chartData, setChartData] = useState<ChartDataItem[]>([])
  const [statusChartData, setStatusChartData] = useState<StatusCodeChartItem[]>([])
  const [tableData, setTableData] = useState<RequestMetadata[]>([])
  const [filteredData, setFilteredData] = useState<RequestMetadata[]>([])
  const [timeFilter, setTimeFilter] = useState("15m")
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedRequest, setSelectedRequest] = useState<{
    request: RequestMetadata;
    response?: ResponseMetadata;
  } | null>(null)
  const [responseData, setResponseData] = useState<ResponseMetadata[]>([])
  const [combinedData, setCombinedData] = useState<Array<{
    request: RequestMetadata;
    response?: ResponseMetadata;
  }>>([])
  const [activeChart, setActiveChart] = useState<"method" | "status">("status")
  const [requests, setRequests] = useState<RequestMetadata[]>([])
  const [responses, setResponses] = useState<Record<string, ResponseMetadata>>({})
  const [showErrors, setShowErrors] = useState(false)
  const [errorPairs, setErrorPairs] = useState<Array<{
    request: RequestMetadata;
    response: ResponseMetadata;
  }>>([])
  const [searchRequestId, setSearchRequestId] = useState<string>("")
  const [isSearching, setIsSearching] = useState(false)
  const [isDetailsOpen, setIsDetailsOpen] = useState(false)

  // Helper function to rewrite URLs
  const rewriteUrl = (originalUrl: string): string => {
    const segments = originalUrl.split('/').filter(Boolean);
    const appIdIndex = segments.findIndex(segment => segment === appId);
    if (appIdIndex !== -1) {
      const pathSegments = segments.slice(appIdIndex + 1);
      return `${appUrl}/${pathSegments.join('/')}`;
    }
    return originalUrl;
  };

  // Add filter function
  const filterDataByTime = (data: RequestMetadata[], filter: string) => {
    if (filter === "all") return data;
    
    const filterMs = TIME_FILTERS.find(f => f.value === filter)?.ms || Infinity;
    const now = new Date().getTime();
    
    return data.filter(item => {
      const timestamp = new Date(item.timestamp).getTime();
      return now - timestamp <= filterMs;
    });
  };

  // Extract fetch logic into reusable function
  const fetchRequestData = async ({ timeFilter = "12h", limit = 100 }: FetchRequestsOptions = {}) => {
    try {
      setIsLoading(true)
      setError(null)
      
      // Convert timeFilter to timestamp
      let fromTimestamp;
      if (timeFilter !== "all") {
        const ms = TIME_FILTERS.find(f => f.value === timeFilter)?.ms || (12 * 60 * 60 * 1000);
        fromTimestamp = new Date(Date.now() - ms).toISOString();
      }

      const queryParams = new URLSearchParams();
      if (fromTimestamp) queryParams.append('from', fromTimestamp);
      if (limit) queryParams.append('limit', limit.toString());

      // Fetch both requests and responses in parallel
      const [requestsResponse, responsesResponse] = await Promise.all([
        fetch(
          `/api/apps/${appId}/requests?${queryParams.toString()}`,
          { credentials: 'include' }
        ),
        fetch(
          `/api/apps/${appId}/responses?${queryParams.toString()}`,
          { credentials: 'include' }
        )
      ]);
      
      if (requestsResponse.status === 403 || responsesResponse.status === 403) {
        setError("You don't have permission to view these requests")
        setChartData([])
        setStatusChartData([])
        setTableData([])
        setResponseData([])
        setIsLoading(false)
        return
      }
      
      if (!requestsResponse.ok || !responsesResponse.ok) {
        throw new Error(`Failed to fetch data: ${!requestsResponse.ok ? requestsResponse.statusText : responsesResponse.statusText}`)
      }

      const rawRequestData = await requestsResponse.json()
      const rawResponseData = await responsesResponse.json()
      
      if (!rawRequestData) {
        setChartData([])
        setStatusChartData([])
        setTableData([])
        setResponseData([])
        return
      }

      const requestData = Array.isArray(rawRequestData) ? rawRequestData : [rawRequestData]
      const responseData = Array.isArray(rawResponseData) ? rawResponseData : [rawResponseData]
      
      const validRequests: RequestMetadata[] = requestData
        .filter((item): item is RequestMetadata => {
          return item && 
            typeof item === 'object' &&
            'method' in item &&
            'timestamp' in item &&
            'url' in item &&
            'id' in item &&
            'headers' in item
        })

      const validResponses: ResponseMetadata[] = responseData
        .filter((item): item is ResponseMetadata => {
          return item && 
            typeof item === 'object' &&
            'statusCode' in item &&
            'timestamp' in item &&
            'requestId' in item &&
            'id' in item &&
            'headers' in item
        })

      setTableData(validRequests)
      setResponseData(validResponses)
    } catch (err) {
      console.error('Error fetching data:', err)
      setError(err instanceof Error ? err.message : 'Failed to load data')
      setChartData([])
      setStatusChartData([])
      setTableData([])
      setResponseData([])
    } finally {
      setIsLoading(false)
    }
  }

  // Update useEffect to use the extracted function
  useEffect(() => {
    fetchRequestData({ timeFilter })
  }, [appId, timeFilter])

  // Update useEffect to include filtering and sorting
  useEffect(() => {
    const filtered = filterDataByTime(tableData, timeFilter);
    
    // Sort by timestamp in descending order (most recent first)
    const sortedAndFiltered = [...filtered].sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    setFilteredData(sortedAndFiltered);

    // Recalculate chart data based on filtered results
    const methodCounts = sortedAndFiltered.reduce((acc, request) => {
      const method = request.method || 'UNKNOWN'
      acc[method] = (acc[method] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const newChartData = Object.entries(methodCounts)
      .filter(([method]) => method)
      .map(([method, count]) => ({ 
        method: method || 'UNKNOWN', 
        count: count || 0 
      }))

    setChartData(newChartData)
  }, [tableData, timeFilter])

  // Add useEffect to combine request and response data
  useEffect(() => {
    // Create a map of responses by requestId for quick lookup
    const responseMap = responseData.reduce((map, response) => {
      map[response.requestId] = response;
      return map;
    }, {} as Record<string, ResponseMetadata>);
    
    // Combine requests with their responses
    const combined = filteredData.map(request => ({
      request,
      response: responseMap[request.id]
    }));
    
    setCombinedData(combined);

    // Generate status code chart data
    const statusCodeCounts = {
      success: 0,   // 200-299
      redirect: 0,  // 300-399
      clientError: 0, // 400-499
      serverError: 0, // 500-599
      unknown: 0    // others or no response
    };

    combined.forEach(({ response }) => {
      if (!response) {
        statusCodeCounts.unknown++;
      } else {
        const statusCode = response.statusCode;
        if (statusCode >= 200 && statusCode < 300) {
          statusCodeCounts.success++;
        } else if (statusCode >= 300 && statusCode < 400) {
          statusCodeCounts.redirect++;
        } else if (statusCode >= 400 && statusCode < 500) {
          statusCodeCounts.clientError++;
        } else if (statusCode >= 500 && statusCode < 600) {
          statusCodeCounts.serverError++;
        } else {
          statusCodeCounts.unknown++;
        }
      }
    });

    // Convert to chart data format
    const newStatusChartData = [
      { name: "Success (2xx)", value: statusCodeCounts.success, color: STATUS_COLORS.success },
      { name: "Redirect (3xx)", value: statusCodeCounts.redirect, color: STATUS_COLORS.redirect },
      { name: "Client Error (4xx)", value: statusCodeCounts.clientError, color: STATUS_COLORS.clientError },
      { name: "Server Error (5xx)", value: statusCodeCounts.serverError, color: STATUS_COLORS.serverError },
      { name: "Unknown", value: statusCodeCounts.unknown, color: STATUS_COLORS.unknown }
    ].filter(item => item.value > 0); // Only include non-zero values

    setStatusChartData(newStatusChartData);
  }, [filteredData, responseData]);

  // Calculate derived values safely
  const totalRequests = chartData?.reduce((sum, item) => sum + (item?.count || 0), 0) || 0
  const topEndpoint = tableData?.length > 0 
    ? rewriteUrl(tableData.reduce((a, b) => (a?.url === b?.url ? a : b))?.url || "No requests yet")
    : "No requests yet"

  const fetchErrorRequests = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`/api/apps/${appId}/errors?limit=50`, {
        credentials: 'include',
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch error requests');
      }
      
      const data = await response.json();
      setErrorPairs(data);
      setShowErrors(true);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load error requests. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = () => {
    if (showErrors) {
      fetchErrorRequests();
    } else {
      fetchRequestData({ timeFilter });
    }
  };

  const toggleErrorView = () => {
    if (!showErrors) {
      fetchErrorRequests();
    } else {
      setShowErrors(false);
    }
  };

  const handleRequestSearch = async () => {
    if (!searchRequestId.trim()) {
      toast({
        title: "Error",
        description: "Please enter a request ID to search",
        variant: "destructive",
      })
      return
    }
    
    setIsSearching(true)
    try {
      const response = await fetch(`/api/requests/${searchRequestId}`, {
        credentials: 'include',
      })
      
      if (response.status === 404) {
        toast({
          title: "Not Found",
          description: "No request found with that ID",
          variant: "destructive",
        })
        return
      }
      
      if (!response.ok) {
        throw new Error(`Error: ${response.statusText}`)
      }
      
      const data = await response.json()
      setSelectedRequest(data)
      setIsDetailsOpen(true)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to search for request",
        variant: "destructive",
      })
      console.error("Search error:", error)
    } finally {
      setIsSearching(false)
    }
  }

  if (isLoading) {
    return (
      <div className="grid gap-4">
        <Card>
          <CardContent className="p-8">
            <LoadingSpinner 
              variant="skeleton" 
              text="Loading request data..." 
              count={4}
            />
          </CardContent>
        </Card>
      </div>
    )
  }

  if (error) {
    return <div className="grid gap-4">
      <Card>
        <CardContent className="p-8">
          <div className="flex items-center justify-center text-red-600">
            {error}
          </div>
        </CardContent>
      </Card>
    </div>
  }

  // Helper to format headers for display
  const formatHeaders = (headers: string[]) => {
    if (!Array.isArray(headers)) return []
    return headers.map(header => {
      try {
        return JSON.parse(header)
      } catch {
        return header
      }
    })
  }

  // Custom tooltip for the status code pie chart
  const StatusCodeTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-2 rounded shadow-md border">
          <p className="font-medium">{data.name}</p>
          <p className="text-sm">{`Count: ${data.value}`}</p>
          <p className="text-sm">{`Percentage: ${((data.value / totalRequests) * 100).toFixed(1)}%`}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="grid gap-4">
      <Card className="w-full">
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>HTTP Request Analytics</CardTitle>
              <CardDescription>Request and response statistics for the selected period</CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant={showErrors ? "default" : "outline"}
                size="sm"
                onClick={toggleErrorView}
                className="flex items-center gap-1"
              >
                <AlertTriangle className="h-4 w-4" />
                {showErrors ? "Show All" : "Show Errors Only"}
              </Button>
              <Select value={timeFilter} onValueChange={setTimeFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select time period" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_FILTERS.map((filter) => (
                    <SelectItem key={filter.value} value={filter.value}>
                      {filter.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={handleRefresh}
                disabled={isLoading}
              >
                <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        
        <div className="px-6 pb-2">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search by request ID..."
                className="pl-8"
                value={searchRequestId}
                onChange={(e) => setSearchRequestId(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleRequestSearch()
                  }
                }}
              />
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRequestSearch}
              disabled={isSearching}
            >
              {isSearching ? "Searching..." : "Search"}
            </Button>
          </div>
        </div>
        
        <CardContent>
          <div className="flex justify-center gap-4 mb-4">
            <Button 
              variant={activeChart === "status" ? "default" : "outline"}
              onClick={() => setActiveChart("status")}
            >
              Status Codes
            </Button>
            <Button 
              variant={activeChart === "method" ? "default" : "outline"}
              onClick={() => setActiveChart("method")}
            >
              HTTP Methods
            </Button>
          </div>

          <div className="mt-4">
            {activeChart === "status" ? (
              <ChartContainer config={{
                height: { label: "Height", value: 350 } as any
              }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={statusChartData}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                      outerRadius={120}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusChartData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip content={<StatusCodeTooltip />} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </ChartContainer>
            ) : (
              <ChartContainer config={{
                height: { label: "Height", value: 350 } as any
              }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                    <XAxis dataKey="method" />
                    <YAxis />
                    <Bar dataKey="count" fill="#10b981" />
                    <Tooltip content={<ChartTooltipContent />} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartContainer>
            )}
          </div>
          <div className="mt-4">
            <p>Total Requests: {totalRequests}</p>
            <p>Top Endpoint: {topEndpoint}</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent HTTP Requests</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Method</TableHead>
                <TableHead>URL</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Size (Req/Res)</TableHead>
                <TableHead>Latency</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {showErrors ? (
                errorPairs.map((pair) => (
                  <TableRow 
                    key={pair.request.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setSelectedRequest({ request: pair.request, response: pair.response });
                      setIsDetailsOpen(true);
                    }}
                  >
                    <TableCell>{new Date(pair.request.timestamp).toLocaleString()}</TableCell>
                    <TableCell>{pair.request.method}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{rewriteUrl(pair.request.url)}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded text-xs ${
                        pair.response.statusCode >= 200 && pair.response.statusCode < 300 
                          ? 'bg-green-100 text-green-800' 
                          : pair.response.statusCode >= 400 
                            ? 'bg-red-100 text-red-800' 
                            : 'bg-yellow-100 text-yellow-800'
                      }`}>
                        {pair.response.statusCode}
                      </span>
                    </TableCell>
                    <TableCell>
                      {`${pair.request.bodyLength} B`}
                      {pair.response && ` / ${pair.response.bodyLength} B`}
                    </TableCell>
                    <TableCell>
                      {pair.response ? (
                        `${Math.round(
                          new Date(pair.response.timestamp).getTime() - 
                          new Date(pair.request.timestamp).getTime()
                        )} ms`
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                combinedData.map(({ request, response }) => (
                  <TableRow 
                    key={request.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => {
                      setSelectedRequest({ request, response });
                      setIsDetailsOpen(true);
                    }}
                  >
                    <TableCell>{new Date(request.timestamp).toLocaleString()}</TableCell>
                    <TableCell>{request.method}</TableCell>
                    <TableCell className="max-w-[200px] truncate">{rewriteUrl(request.url)}</TableCell>
                    <TableCell>
                      {response ? (
                        <span className={`px-2 py-1 rounded text-xs ${
                          response.statusCode >= 200 && response.statusCode < 300 
                            ? 'bg-green-100 text-green-800' 
                            : response.statusCode >= 400 
                              ? 'bg-red-100 text-red-800' 
                              : 'bg-yellow-100 text-yellow-800'
                        }`}>
                          {response.statusCode}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {`${request.bodyLength} B`}
                      {response && ` / ${response.bodyLength} B`}
                    </TableCell>
                    <TableCell>
                      {response ? (
                        `${Math.round(
                          new Date(response.timestamp).getTime() - 
                          new Date(request.timestamp).getTime()
                        )} ms`
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={isDetailsOpen} onOpenChange={setIsDetailsOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Request Details</DialogTitle>
          </DialogHeader>
          
          <div className="mb-4">
            <h3 className="font-medium mb-1">Request ID</h3>
            <div className="flex items-center gap-2">
              <code className="bg-muted px-2 py-1 rounded text-sm">{selectedRequest?.request.id}</code>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  navigator.clipboard.writeText(selectedRequest?.request.id || "");
                  toast({
                    title: "Copied!",
                    description: "Request ID copied to clipboard",
                  });
                }}
                className="h-6 w-6"
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {selectedRequest && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium mb-1">Timestamp</h3>
                  <p className="font-mono text-sm">
                    {new Date(selectedRequest.request.timestamp).toLocaleString()}
                  </p>
                </div>
                <div>
                  <h3 className="font-medium mb-1">Method</h3>
                  <p className="font-mono text-sm">{selectedRequest.request.method}</p>
                </div>
                <div>
                  <h3 className="font-medium mb-1">Request Size</h3>
                  <p className="font-mono text-sm">{selectedRequest.request.bodyLength} B</p>
                </div>
              </div>

              <div>
                <h3 className="font-medium mb-1">URL</h3>
                <p className="font-mono text-sm break-all">
                  {rewriteUrl(selectedRequest.request.url)}
                </p>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <h3 className="font-medium">Request Headers</h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const headersText = formatHeaders(selectedRequest.request.headers)
                        .map(header => JSON.stringify(header, null, 2))
                        .join('\n');
                      navigator.clipboard.writeText(headersText);
                      toast({
                        title: "Copied!",
                        description: "Request headers copied to clipboard",
                      });
                    }}
                    className="h-7 text-xs"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy Headers
                  </Button>
                </div>
                <div className="bg-muted rounded-lg p-4 font-mono text-sm max-h-[200px] overflow-y-auto">
                  <pre className="whitespace-pre-wrap break-all">
                    {formatHeaders(selectedRequest.request.headers)
                      .map(header => JSON.stringify(header, null, 2))
                      .join('\n')}
                  </pre>
                </div>
              </div>

              {selectedRequest.response && (
                <>
                  <div className="border-t pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <h3 className="font-medium mb-1">Status Code</h3>
                        <p className="font-mono text-sm">
                          <span className={`px-2 py-1 rounded ${
                            selectedRequest.response.statusCode >= 200 && selectedRequest.response.statusCode < 300 
                              ? 'bg-green-100 text-green-800' 
                              : selectedRequest.response.statusCode >= 400 
                                ? 'bg-red-100 text-red-800' 
                                : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {selectedRequest.response.statusCode}
                          </span>
                        </p>
                      </div>
                      <div>
                        <h3 className="font-medium mb-1">Response Size</h3>
                        <p className="font-mono text-sm">{selectedRequest.response.bodyLength} B</p>
                      </div>
                      <div>
                        <h3 className="font-medium mb-1">Response Time</h3>
                        <p className="font-mono text-sm">
                          {new Date(selectedRequest.response.timestamp).toLocaleString()}
                        </p>
                      </div>
                      <div>
                        <h3 className="font-medium mb-1">Response Latency</h3>
                        <p className="font-mono text-sm">
                          {Math.round(
                            new Date(selectedRequest.response.timestamp).getTime() - 
                            new Date(selectedRequest.request.timestamp).getTime()
                          )} ms
                        </p>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <h3 className="font-medium">Response Headers</h3>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const headersText = formatHeaders(selectedRequest.response!.headers)
                            .map(header => JSON.stringify(header, null, 2))
                            .join('\n');
                          navigator.clipboard.writeText(headersText);
                          toast({
                            title: "Copied!",
                            description: "Response headers copied to clipboard",
                          });
                        }}
                        className="h-7 text-xs"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy Headers
                      </Button>
                    </div>
                    <div className="bg-muted rounded-lg p-4 font-mono text-sm max-h-[200px] overflow-y-auto">
                      <pre className="whitespace-pre-wrap break-all">
                        {formatHeaders(selectedRequest.response.headers)
                          .map(header => JSON.stringify(header, null, 2))
                          .join('\n')}
                      </pre>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
