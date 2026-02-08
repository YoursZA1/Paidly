# Pagination Implementation

## Overview
Pagination has been implemented across all major list pages to improve performance and user experience when dealing with large datasets.

## Pages with Pagination

### 1. Invoices Page
- **Location**: `src/pages/Invoices.jsx`
- **Default Page Size**: 25 items
- **Available Options**: 10, 25, 50, 100 items per page
- **Features**:
  - Works seamlessly with existing filters and sorting
  - Resets to page 1 when filters change
  - Shows total invoice count
  - Previous/Next navigation with numbered page buttons
  - Displays up to 5 page numbers with smart pagination

### 2. Quotes Page
- **Location**: `src/pages/Quotes.jsx`
- **Default Page Size**: 25 items
- **Available Options**: 10, 25, 50, 100 items per page
- **Features**:
  - Integrates with search and sort functionality
  - Resets to page 1 when search or sort changes
  - Shows total quote count
  - Previous/Next navigation with numbered page buttons

### 3. Clients Page
- **Location**: `src/pages/Clients.jsx`
- **Default Page Size**: 24 items (optimized for grid view - 3 columns)
- **Available Options**: 12, 24, 48, 96 items per page
- **Features**:
  - Works with both grid and list view modes
  - Resets to page 1 when search or filters change
  - Shows total client count
  - Page size options optimized for grid layout (multiples of 12)

### 4. Payslips Page
- **Location**: `src/pages/Payslips.jsx`
- **Default Page Size**: 25 items
- **Available Options**: 10, 25, 50, 100 items per page
- **Features**:
  - Works with both desktop table and mobile card views
  - Resets to page 1 when search changes
  - Shows total payslip count

## Technical Implementation

### State Management
Each page includes:
```javascript
const [currentPage, setCurrentPage] = useState(1);
const [itemsPerPage, setItemsPerPage] = useState(25); // or 24 for Clients
```

### Pagination Logic
```javascript
// Calculate total pages
const totalPages = Math.ceil(filteredItems.length / itemsPerPage);

// Slice data for current page
const paginatedItems = filteredItems.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
);

// Reset to page 1 when filters change
useEffect(() => {
    setCurrentPage(1);
}, [filters, searchTerm, sortBy]);
```

### UI Components

#### Page Size Selector
- Dropdown to choose items per page
- Automatically resets to page 1 when changed
- Shows total count: "of X items"

#### Page Navigation
- **Previous Button**: Disabled on first page
- **Page Numbers**: Shows up to 5 numbered buttons with smart display logic
  - Shows 1-5 when on early pages
  - Shows centered range around current page
  - Shows last 5 when on later pages
- **Next Button**: Disabled on last page

### Smart Page Number Display
The pagination shows a maximum of 5 page buttons with intelligent positioning:
```javascript
// Shows pages like: [1] [2] [3] [4] [5]
// Or: [1] [2] [3] [4] ... [10]
// Or: [1] ... [5] [6] [7] ... [10]
```

## Performance Benefits

1. **Reduced DOM Rendering**: Only renders items for the current page
2. **Faster Initial Load**: Smaller DOM = faster paint and interaction
3. **Better User Experience**: Easier to browse through organized pages
4. **Scalability**: Can handle hundreds or thousands of records efficiently

## User Experience Features

1. **Persistent Controls**: Pagination always visible when multiple pages exist
2. **Visual Feedback**: Active page highlighted with different button style
3. **Responsive Design**: Adapts to mobile and desktop layouts
4. **Smart Defaults**: 
   - Invoices/Quotes/Payslips: 25 items (good for table views)
   - Clients: 24 items (perfect for 3-column grid)

## Auto-Reset Behavior

Pagination automatically resets to page 1 when:
- Search term changes
- Filters are applied/modified
- Sort order changes
- Page size selection changes

This prevents users from being on page 5 with no results after filtering.

## Integration Notes

### With Existing Features
- **Filters**: Pagination applies after filtering
- **Search**: Pagination applies to search results
- **Sorting**: Pagination applies to sorted data
- **View Modes**: Pagination works with both grid and list views

### Order of Operations
1. Load all data
2. Apply search filter
3. Apply advanced filters
4. Apply sorting
5. Calculate pagination
6. Display current page

## Testing Recommendations

1. **Small Datasets** (< page size)
   - Verify pagination controls don't show
   - All items display correctly

2. **Large Datasets** (multiple pages)
   - Navigate through all pages
   - Test with different page sizes
   - Verify counts are accurate

3. **With Filters Active**
   - Apply filters and verify page reset
   - Ensure pagination reflects filtered count
   - Test edge cases (filter results in exactly 1 page)

4. **Mobile Responsiveness**
   - Test pagination controls on mobile
   - Verify page number buttons are touch-friendly

## Future Enhancements

Potential improvements:
1. **URL Parameters**: Add page number to URL for bookmarking
2. **Keyboard Navigation**: Arrow keys for page navigation
3. **Jump to Page**: Input field to jump to specific page
4. **Infinite Scroll**: Optional infinite scroll mode
5. **Server-Side Pagination**: For extremely large datasets (1000+ items)

## Browser Compatibility

Works in all modern browsers:
- Chrome/Edge (latest)
- Firefox (latest)
- Safari (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## Code References

- **Invoices**: [src/pages/Invoices.jsx](src/pages/Invoices.jsx#L1)
- **Quotes**: [src/pages/Quotes.jsx](src/pages/Quotes.jsx#L1)
- **Clients**: [src/pages/Clients.jsx](src/pages/Clients.jsx#L1)
- **Payslips**: [src/pages/Payslips.jsx](src/pages/Payslips.jsx#L1)
