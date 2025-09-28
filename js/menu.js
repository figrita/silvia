import {mapJoin} from './utils.js'
import {SNode} from './snode.js'
import {nodeList} from './registry.js' // Direct access to the flat list
import {categorizedNodeList} from './categories.js'

// ============================================================================
// MODULE-LEVEL VARIABLES
// ============================================================================
let quickMenu
let startMenu
let editor
let X = 0 // Will be set after editor is available
let Y = window.innerHeight / 2
let ignoreNextMouseUp = false // Ignore mouseup that follows contextmenu on same mouse action

// ============================================================================
// KEYBOARD NAVIGATION MANAGER CLASS
// ============================================================================
class KeyboardNavigationManager {
    constructor(menuEl, submenuContainer, showSubmenuCallback, hideSubmenuCallback, hideAllMenusCallback) {
        this.menuEl = menuEl
        this.submenuContainer = submenuContainer
        this.showSubmenuCallback = showSubmenuCallback
        this.hideSubmenuCallback = hideSubmenuCallback
        this.hideAllMenusCallback = hideAllMenusCallback
        
        this.selectedCategoryIndex = -1 // -1 = no selection (Windows behavior)
        this.selectedNodeIndex = -1
        this.inSubmenu = false
        this.isActive = false
        
        this.boundKeyHandler = this.handleKeydown.bind(this)
        this.boundMouseHandler = this.handleMouseOver.bind(this)
    }
    
    activate() {
        if (this.isActive) return
        this.isActive = true
        this.selectedCategoryIndex = -1 // Start with no selection
        this.selectedNodeIndex = -1
        this.inSubmenu = false
        
        document.addEventListener('keydown', this.boundKeyHandler)
        this.menuEl.addEventListener('mouseover', this.boundMouseHandler)
        
        // Don't update selection on activate - start with nothing selected
        this.clearSelection()
        this.focusMenu()
    }
    
    deactivate() {
        if (!this.isActive) return
        this.isActive = false
        
        document.removeEventListener('keydown', this.boundKeyHandler)
        this.menuEl.removeEventListener('mouseover', this.boundMouseHandler)
        this.submenuContainer.removeEventListener('mouseover', this.boundMouseHandler)
        
        this.clearSelection()
        this.menuEl.blur()
    }
    
    focusMenu() {
        // Make menu focusable and focus it
        this.menuEl.tabIndex = -1
        this.menuEl.focus({ preventScroll: true })
    }
    
    getCategoryItems() {
        return Array.from(this.menuEl.querySelectorAll('.menu-category-item'))
    }
    
    getSubmenuItems() {
        const currentSubmenu = this.submenuContainer.querySelector('.menu-category-submenu.visible')
        return currentSubmenu ? Array.from(currentSubmenu.querySelectorAll('.menu-item')) : []
    }
    
    updateSelection() {
        this.clearSelection()
        
        if (!this.inSubmenu) {
            // Highlight category (only if index is valid)
            if (this.selectedCategoryIndex >= 0) {
                const categories = this.getCategoryItems()
                if (categories[this.selectedCategoryIndex]) {
                    categories[this.selectedCategoryIndex].classList.add('keyboard-selected')
                }
            }
        } else {
            // Highlight node in submenu (only if index is valid)
            if (this.selectedNodeIndex >= 0) {
                const items = this.getSubmenuItems()
                if (items[this.selectedNodeIndex]) {
                    items[this.selectedNodeIndex].classList.add('keyboard-selected')
                }
            }
        }
    }
    
    clearSelection() {
        // Clear category selection
        this.getCategoryItems().forEach(item => {
            item.classList.remove('keyboard-selected')
        })
        
        // Clear submenu selection
        const allSubmenuItems = this.submenuContainer.querySelectorAll('.menu-item')
        allSubmenuItems.forEach(item => {
            item.classList.remove('keyboard-selected')
        })
    }
    
    handleMouseOver(e) {
        if (!this.isActive) return
        
        // Update keyboard selection based on mouse hover
        const categoryItem = e.target.closest('.menu-category-item')
        const menuItem = e.target.closest('.menu-item')
        
        if (categoryItem && !this.inSubmenu) {
            const categories = this.getCategoryItems()
            const index = categories.indexOf(categoryItem)
            if (index !== -1) {
                this.selectedCategoryIndex = index
                this.updateSelection()
            }
        } else if (menuItem && this.inSubmenu) {
            const items = this.getSubmenuItems()
            const index = items.indexOf(menuItem)
            if (index !== -1) {
                this.selectedNodeIndex = index
                this.updateSelection()
            }
        }
    }
    
    handleKeydown(e) {
        if (!this.isActive) return
        
        switch (e.key) {
            case 'ArrowUp':
                e.preventDefault()
                this.navigateUp()
                break
            case 'ArrowDown':
                e.preventDefault()
                this.navigateDown()
                break
            case 'ArrowRight':
                e.preventDefault()
                this.navigateRight()
                break
            case 'ArrowLeft':
                e.preventDefault()
                this.navigateLeft()
                break
            case 'Enter':
                e.preventDefault()
                this.activateSelected()
                break
            case 'Escape':
                e.preventDefault()
                if (this.inSubmenu) {
                    this.navigateLeft() // Go back to categories
                } else {
                    this.hideAllMenusCallback()
                }
                break
        }
    }
    
    navigateUp() {
        if (!this.inSubmenu) {
            // Navigate categories
            const categories = this.getCategoryItems()
            if (categories.length > 0) {
                // Windows behavior: if nothing selected, Up selects bottom item
                if (this.selectedCategoryIndex === -1) {
                    this.selectedCategoryIndex = categories.length - 1
                } else if (this.selectedCategoryIndex > 0) {
                    this.selectedCategoryIndex--
                } else {
                    // Wrap to bottom
                    this.selectedCategoryIndex = categories.length - 1
                }
                this.updateSelection()
            }
        } else {
            // Navigate submenu items
            const items = this.getSubmenuItems()
            if (items.length > 0) {
                if (this.selectedNodeIndex === -1) {
                    this.selectedNodeIndex = items.length - 1
                } else if (this.selectedNodeIndex > 0) {
                    this.selectedNodeIndex--
                } else {
                    // Wrap to bottom
                    this.selectedNodeIndex = items.length - 1
                }
                this.updateSelection()
                this.scrollItemIntoView(items[this.selectedNodeIndex])
            }
        }
    }
    
    navigateDown() {
        if (!this.inSubmenu) {
            // Navigate categories
            const categories = this.getCategoryItems()
            if (categories.length > 0) {
                // Windows behavior: if nothing selected, Down selects top item
                if (this.selectedCategoryIndex === -1) {
                    this.selectedCategoryIndex = 0
                } else if (this.selectedCategoryIndex < categories.length - 1) {
                    this.selectedCategoryIndex++
                } else {
                    // Wrap to top
                    this.selectedCategoryIndex = 0
                }
                this.updateSelection()
            }
        } else {
            // Navigate submenu items
            const items = this.getSubmenuItems()
            if (items.length > 0) {
                if (this.selectedNodeIndex === -1) {
                    this.selectedNodeIndex = 0
                } else if (this.selectedNodeIndex < items.length - 1) {
                    this.selectedNodeIndex++
                } else {
                    // Wrap to top
                    this.selectedNodeIndex = 0
                }
                this.updateSelection()
                this.scrollItemIntoView(items[this.selectedNodeIndex])
            }
        }
    }
    
    navigateRight() {
        if (!this.inSubmenu) {
            // Enter submenu
            this.activateSelected()
        }
    }
    
    navigateLeft() {
        if (this.inSubmenu) {
            // Exit submenu, go back to categories
            this.hideSubmenuCallback()
            this.inSubmenu = false
            this.selectedNodeIndex = -1 // Reset to no selection
            this.updateSelection()
            this.focusMenu()
        }
    }
    
    activateSelected() {
        if (!this.inSubmenu) {
            // Open submenu for selected category
            const categories = this.getCategoryItems()
            // Only activate if we have a valid selection
            if (this.selectedCategoryIndex >= 0) {
                const selectedCategory = categories[this.selectedCategoryIndex]
                if (selectedCategory) {
                    this.showSubmenuCallback(selectedCategory)
                    this.inSubmenu = true
                    this.selectedNodeIndex = 0
                    this.updateSelection()
                    this.setupSubmenuMouseHandler()
                }
            }
        } else {
            // Activate selected node
            const items = this.getSubmenuItems()
            // Only activate if we have a valid selection
            if (this.selectedNodeIndex >= 0) {
                const selectedItem = items[this.selectedNodeIndex]
                if (selectedItem) {
                    // Trigger mouseup event to create the node
                    const mouseUpEvent = new MouseEvent('mouseup', {
                        bubbles: true,
                        cancelable: true,
                        view: window
                    })
                    selectedItem.dispatchEvent(mouseUpEvent)
                }
            }
        }
    }
    
    setupSubmenuMouseHandler() {
        // Add mouse handler to submenu container when entering submenu
        this.submenuContainer.addEventListener('mouseover', this.boundMouseHandler)
    }
    
    scrollItemIntoView(item) {
        if (item) {
            item.scrollIntoView({ 
                block: 'nearest', 
                behavior: 'smooth' 
            })
        }
    }
    
    // Called when submenu is shown programmatically (e.g., via mouse hover)
    onSubmenuShown() {
        if (this.isActive) {
            this.inSubmenu = true
            this.selectedNodeIndex = -1
            this.updateSelection()
            this.setupSubmenuMouseHandler()
        }
    }
    
    // Called when submenu is hidden programmatically
    onSubmenuHidden() {
        if (this.isActive) {
            this.inSubmenu = false
            this.selectedNodeIndex = 0
            this.updateSelection()
            this.submenuContainer.removeEventListener('mouseover', this.boundMouseHandler)
        }
    }
}

// ============================================================================
// SHARED HELPER FUNCTIONS
// ============================================================================

// --- Helper for creating a single node item for a menu ---
function createMenuItem(nodeDef){
    const nodeEl = document.createElement('div')
    nodeEl.className = 'menu-item'
    nodeEl.dataset.slug = nodeDef.slug
    nodeEl.innerHTML = `
        <div class="node-icon">${nodeDef.icon}</div>
        <div class="node-label">${nodeDef.label}</div>
        ${nodeDef.io[0].length ? `
            <div class="node-inputs">
                ${mapJoin(nodeDef.io[0], (input) => `<div class="port ${input}"></div>`)}
            </div>
        ` : ''}
        <hr />
        ${nodeDef.io[1].length ? `
            <div class="node-outputs">
                ${mapJoin(nodeDef.io[1], (output) => `<div class="port ${output}"></div>`)}
            </div>
        ` : ''}
    `
    // Clear flag on mousedown - this allows Windows/Linux clicks to work normally
    // while still protecting macOS from contextmenu->mouseup on same action
    nodeEl.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        ignoreNextMouseUp = false
    })
    
    // Trigger on mouseup instead of click
    nodeEl.addEventListener('mouseup', (e) => {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
        
        // Ignore mouseup that immediately follows contextmenu (macOS behavior)
        if (ignoreNextMouseUp) {
            ignoreNextMouseUp = false
            return
        }
        
        // Clean up any visible tooltips immediately
        const existingTooltips = document.querySelectorAll('.menu-tooltip')
        existingTooltips.forEach(tooltip => tooltip.remove())
        
        // Use the stored X and Y to create the node
        new SNode(nodeEl.dataset.slug, X + editor.scrollLeft, Y)
        hideAllMenus()
    })
    
    // Prevent click from doing anything
    nodeEl.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
        e.stopImmediatePropagation()
    })

    // Add tooltip functionality if node has tooltip
    if(nodeDef.tooltip) {
        let tooltipEl = null
        let tooltipTimeout = null
        
        nodeEl.addEventListener('mouseenter', (e) => {
            // Clean up any existing tooltip first
            if (tooltipEl) {
                tooltipEl.remove()
                tooltipEl = null
            }
            if (tooltipTimeout) {
                clearTimeout(tooltipTimeout)
                tooltipTimeout = null
            }
            
            // Create tooltip element
            tooltipEl = document.createElement('div')
            tooltipEl.className = 'menu-tooltip'
            tooltipEl.textContent = nodeDef.tooltip
            document.body.appendChild(tooltipEl)
            
            // Position tooltip
            const rect = nodeEl.getBoundingClientRect()
            const tooltipRect = tooltipEl.getBoundingClientRect()
            
            let left = rect.right + 10
            let top = rect.top
            
            // Keep tooltip in viewport
            if (left + tooltipRect.width > window.innerWidth) {
                left = rect.left - tooltipRect.width - 10
            }
            if (top + tooltipRect.height > window.innerHeight) {
                top = window.innerHeight - tooltipRect.height - 10
            }
            
            tooltipEl.style.left = `${left}px`
            tooltipEl.style.top = `${top}px`
            
            // Show tooltip after brief delay
            tooltipTimeout = setTimeout(() => {
                if (tooltipEl) {
                    tooltipEl.classList.add('visible')
                }
                tooltipTimeout = null
            }, 500)
        })
        
        nodeEl.addEventListener('mouseleave', (e) => {
            if (tooltipTimeout) {
                clearTimeout(tooltipTimeout)
                tooltipTimeout = null
            }
            if (tooltipEl) {
                tooltipEl.remove()
                tooltipEl = null
            }
        })
    }

    return nodeEl
}

// Helper to set node creation position at editor center
function setCenterNodePosition() {
    const editorRect = editor.getBoundingClientRect()
    const editorWidth = editorRect.width
    const viewportHeight = window.innerHeight
    // Offset by estimated node dimensions to center the node (not its top-left corner)
    // Most nodes are roughly 200px wide and 100px tall
    X = (editorWidth / 2) - 150  // Offset by half of estimated width
    Y = (viewportHeight / 2) - 250   // Offset by half of estimated height
}

// ============================================================================
// QUICK MENU (Right-click)
// ============================================================================
function createQuickMenu(){
    const menuEl = document.createElement('div')
    menuEl.id = 'nodes-menu-quick'
    menuEl.className = 'nodes-menu'

    // Add search input at the top
    const searchContainer = document.createElement('div')
    searchContainer.className = 'menu-search-container'
    
    const searchInput = document.createElement('input')
    searchInput.type = 'text'
    searchInput.className = 'menu-search-input'
    searchInput.placeholder = 'Search nodes...'
    searchInput.id = 'nodes-menu-search'
    
    searchContainer.appendChild(searchInput)
    menuEl.appendChild(searchContainer)

    const contentEl = document.createElement('div')
    contentEl.id = 'nodes-menu-quick-content'

    // Get all nodes from the flat list, sort by label
    const allNodesSorted = Object.values(nodeList).sort((a, b) => a.label.localeCompare(b.label))
    
    // Store all menu items for filtering
    const allMenuItems = []
    allNodesSorted.forEach(nodeDef => {
        const menuItem = createMenuItem(nodeDef)
        allMenuItems.push({
            element: menuItem,
            nodeDef: nodeDef,
            label: nodeDef.label.toLowerCase(),
            slug: nodeDef.slug.toLowerCase(),
            searchText: `${nodeDef.label.toLowerCase()} ${nodeDef.slug.toLowerCase()}`
        })
        contentEl.appendChild(menuItem)
    })
    
    // Track selected item
    let selectedIndex = 0
    
    // Helper function to get visible items in visual order
    function getVisibleItemsInOrder() {
        return allMenuItems.filter(item => 
            item.element.style.display !== 'none'
        ).sort((a, b) => {
            const orderA = parseInt(a.element.style.order) || 0
            const orderB = parseInt(b.element.style.order) || 0
            return orderA - orderB
        })
    }
    
    // Fuzzy search function
    function fuzzyMatch(pattern, text) {
        pattern = pattern.toLowerCase()
        text = text.toLowerCase()
        
        let patternIdx = 0
        let textIdx = 0
        let score = 0
        let consecutiveMatches = 0
        
        while (patternIdx < pattern.length && textIdx < text.length) {
            if (pattern[patternIdx] === text[textIdx]) {
                patternIdx++
                consecutiveMatches++
                score += consecutiveMatches // Bonus for consecutive matches
            } else {
                consecutiveMatches = 0
            }
            textIdx++
        }
        
        return patternIdx === pattern.length ? score : 0
    }
    
    // Enhanced fuzzy match with prefix bonuses
    function fuzzyMatchWithPrefix(pattern, item) {
        pattern = pattern.toLowerCase()
        
        // Get base fuzzy match score
        let score = fuzzyMatch(pattern, item.searchText)
        if (score === 0) return 0
        
        // Check if label or slug starts with pattern for huge bonus
        if (item.label.startsWith(pattern) || item.slug.startsWith(pattern)) {
            score += 10000
        }
        // Check if any word in label starts with pattern
        else if (item.label.split(' ').some(word => word.startsWith(pattern))) {
            score += 5000
        }
        // Check if first letter matches
        else if (pattern.length > 0 && (item.label[0] === pattern[0] || item.slug[0] === pattern[0])) {
            score += 1000
        }
        
        return score
    }
    
    // Update selection visual
    function updateSelection() {
        const visibleItems = getVisibleItemsInOrder()
        
        visibleItems.forEach((item, index) => {
            if (index === selectedIndex) {
                item.element.classList.add('selected')
            } else {
                item.element.classList.remove('selected')
            }
        })
        
        return visibleItems
    }
    
    // Filter nodes based on search
    searchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.trim()
        
        if (!searchTerm) {
            // Show all items
            allMenuItems.forEach(item => {
                item.element.style.display = 'flex'
                item.element.style.order = ''
            })
            selectedIndex = 0
            updateSelection()
            return
        }
        
        // Score and filter items
        const scoredItems = allMenuItems.map(item => ({
            ...item,
            score: fuzzyMatchWithPrefix(searchTerm, item)
        }))
        
        // Sort by score and update display
        scoredItems.sort((a, b) => b.score - a.score)
        
        scoredItems.forEach((item, index) => {
            if (item.score > 0) {
                item.element.style.display = 'flex'
                item.element.style.order = index.toString()
            } else {
                item.element.style.display = 'none'
            }
        })
        
        selectedIndex = 0
        updateSelection()
    })
    
    // Prevent menu from closing when clicking search input
    searchInput.addEventListener('click', (e) => {
        e.stopPropagation()
    })
    
    // Handle keyboard navigation
    searchInput.addEventListener('keydown', (e) => {
        const visibleItems = getVisibleItemsInOrder()
        
        if (e.key === 'Enter') {
            e.preventDefault()
            // Select current item
            if (visibleItems[selectedIndex]) {
                // Clear ignore flag for keyboard-triggered events
                ignoreNextMouseUp = false
                // Trigger mouseup event instead of click
                const mouseUpEvent = new MouseEvent('mouseup', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                })
                visibleItems[selectedIndex].element.dispatchEvent(mouseUpEvent)
            }
        } else if (e.key === 'ArrowDown') {
            e.preventDefault()
            if (selectedIndex < visibleItems.length - 1) {
                selectedIndex++
                const updatedItems = updateSelection()
                // Scroll into view if needed
                if (updatedItems[selectedIndex]) {
                    updatedItems[selectedIndex].element.scrollIntoView({ 
                        block: 'nearest', 
                        behavior: 'smooth' 
                    })
                }
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault()
            if (selectedIndex > 0) {
                selectedIndex--
                const updatedItems = updateSelection()
                // Scroll into view if needed
                if (updatedItems[selectedIndex]) {
                    updatedItems[selectedIndex].element.scrollIntoView({ 
                        block: 'nearest', 
                        behavior: 'smooth' 
                    })
                }
            }
        } else if (e.key === 'Escape') {
            hideAllMenus()
        }
    })
    
    // Add data attribute to store initial selection
    menuEl.updateSelection = updateSelection
    menuEl.resetSelection = () => {
        selectedIndex = 0
        updateSelection()
    }

    menuEl.appendChild(contentEl)
    document.body.appendChild(menuEl)
    return menuEl
}

// Helper to reset quick menu state
function resetQuickMenu() {
    const searchInput = document.getElementById('nodes-menu-search')
    if (searchInput) {
        searchInput.value = ''
        // Reset all items to visible
        const allItems = quickMenu.querySelectorAll('.menu-item')
        allItems.forEach(item => {
            item.style.display = 'flex'
            item.style.order = ''
            item.classList.remove('selected')
        })
        // Scroll menu content to top
        const contentEl = document.getElementById('nodes-menu-quick-content')
        if (contentEl) {
            contentEl.scrollTop = 0
        }
        // Reset and update selection
        if (quickMenu.resetSelection) {
            quickMenu.resetSelection()
        }
        // Focus after menu renders
        setTimeout(() => searchInput.focus(), 10)
    }
}

function showQuickMenu(e){
    hideAllMenus()
    quickMenu.style.display = 'flex'

    const menuWidth = quickMenu.offsetWidth
    const menuHeight = quickMenu.offsetHeight
    const viewportWidth = window.innerWidth
    const viewportHeight = window.innerHeight

    let menuX = e.clientX
    let menuY = e.clientY

    if(menuX + menuWidth > viewportWidth){ menuX = viewportWidth - menuWidth }
    if(menuY + menuHeight > viewportHeight){ menuY = viewportHeight - menuHeight }
    menuX = Math.max(0, menuX)
    menuY = Math.max(0, menuY)

    quickMenu.style.left = `${menuX}px`
    quickMenu.style.top = `${menuY}px`

    // Store the click location for node creation
    X = e.clientX
    Y = e.clientY
    
    // Set flag to ignore the mouseup that follows contextmenu on macOS
    ignoreNextMouseUp = true
    
    resetQuickMenu()
}

function showQuickMenuCentered(e){
    hideAllMenus()
    quickMenu.style.display = 'flex'

    const menuWidth = quickMenu.offsetWidth
    const editorRect = editor.getBoundingClientRect()
    const editorWidth = editorRect.width

    // Position at top center of editor area (Quake console style)
    const menuX = Math.max(0, (editorWidth - menuWidth) / 2)
    const menuY = 20  // Small offset from top

    quickMenu.style.left = `${menuX}px`
    quickMenu.style.top = `${menuY}px`

    setCenterNodePosition()
    resetQuickMenu()
}

// ============================================================================
// START MENU (Button)
// ============================================================================
function createStartMenu(){
    // ========================================================================
    // 1. INITIALIZATION
    // ========================================================================
    const menuEl = document.createElement('div')
    menuEl.id = 'nodes-menu-start'
    menuEl.className = 'nodes-menu'
    menuEl.tabIndex = -1 // Make focusable for keyboard events
    
    // Create a container for submenus that sits behind the main menu
    const submenuContainer = document.createElement('div')
    submenuContainer.className = 'submenu-container'
    document.body.appendChild(submenuContainer)
    
    // ========================================================================
    // 2. STATE MANAGEMENT
    // ========================================================================
    const menuState = {
        currentOpenSubmenu: null,
        openTimers: new Map(), // Track open timer per submenu
        closeTimer: null,
        categoryShowFunctions: new Map(), // Store showSubmenu functions for keyboard nav
        keyboardNav: null
    }
    
    // ========================================================================
    // 3. HELPER FUNCTIONS
    // ========================================================================
    function hideSubmenu(submenuEl) {
        submenuEl.classList.remove('visible')
        if (menuState.currentOpenSubmenu === submenuEl) {
            menuState.currentOpenSubmenu = null
            // Remove from container after animation
            setTimeout(() => {
                // Double-check it's still a child before removing
                if (submenuEl.parentNode === submenuContainer) {
                    submenuContainer.removeChild(submenuEl)
                }
            }, 200)
        }
        
        // Notify keyboard navigation
        if (menuState.keyboardNav) {
            menuState.keyboardNav.onSubmenuHidden()
        }
    }
    
    function showSubmenu(categoryEl, submenuEl) {
        // Hide any other open submenu immediately
        if (menuState.currentOpenSubmenu && menuState.currentOpenSubmenu !== submenuEl) {
            menuState.currentOpenSubmenu.classList.remove('visible')
            // Only remove if it's actually a child
            if (menuState.currentOpenSubmenu.parentNode === submenuContainer) {
                submenuContainer.removeChild(menuState.currentOpenSubmenu)
            }
        }
        
        // Add submenu to container if not already there
        if (submenuEl.parentNode !== submenuContainer) {
            submenuContainer.appendChild(submenuEl)
        }
        
        // Calculate position relative to menu item
        const itemRect = categoryEl.getBoundingClientRect()
        const menuRect = menuEl.getBoundingClientRect()
        const submenuHeight = submenuEl.offsetHeight || 300 // Estimate if not yet rendered
        const viewportHeight = window.innerHeight
        
        // Position submenu absolutely relative to viewport
        submenuEl.style.position = 'fixed'
        submenuEl.style.left = `${menuRect.right}px`
        submenuEl.style.top = `${itemRect.top}px`
        
        // Reset position classes
        submenuEl.classList.remove('submenu-above')
        
        // Check if submenu would extend past bottom
        if (itemRect.top + submenuHeight > viewportHeight - 20) {
            // Align to viewport bottom
            const newTop = viewportHeight - submenuHeight - 20
            submenuEl.style.top = `${Math.max(20, newTop)}px`
        }
        
        // Show the submenu
        submenuEl.classList.add('visible')
        menuState.currentOpenSubmenu = submenuEl
        
        // Notify keyboard navigation
        if (menuState.keyboardNav) {
            menuState.keyboardNav.onSubmenuShown()
        }
    }
    
    function clearAllTimers() {
        menuState.openTimers.forEach(timer => clearTimeout(timer))
        menuState.openTimers.clear()
        if (menuState.closeTimer) {
            clearTimeout(menuState.closeTimer)
            menuState.closeTimer = null
        }
    }
    
    // ========================================================================
    // 4. BUILD MENU STRUCTURE
    // ========================================================================
    categorizedNodeList.forEach(category => {
        const categoryItemEl = document.createElement('div')
        categoryItemEl.className = 'menu-category-item'

        categoryItemEl.innerHTML = `
            <div class="category-info">
                <span class="category-icon">${category.icon}</span>
                <span class="category-name">${category.name}</span>
            </div>
            <span class="category-arrow">►</span>
        `

        const submenuEl = document.createElement('div')
        submenuEl.className = 'menu-category-submenu nodes-menu' // Reuse styles

        category.nodeDefs.forEach(nodeDef => {
            submenuEl.appendChild(createMenuItem(nodeDef))
        })
        
        // Create show/hide functions for this submenu
        const showThisSubmenu = () => showSubmenu(categoryItemEl, submenuEl)
        const hideThisSubmenu = () => hideSubmenu(submenuEl)
        
        // Store show function for keyboard navigation
        menuState.categoryShowFunctions.set(categoryItemEl, showThisSubmenu)
        
        // ====================================================================
        // 5. MOUSE INTERACTION HANDLERS
        // ====================================================================
        
        // --- Click handlers ---
        categoryItemEl.addEventListener('mousedown', (e) => {
            e.preventDefault()
            e.stopPropagation()
        })
        
        categoryItemEl.addEventListener('mouseup', (e) => {
            e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()
            
            // Clear all timers
            clearAllTimers()
            
            // Always show this submenu
            showThisSubmenu()
        })
        
        categoryItemEl.addEventListener('click', (e) => {
            e.preventDefault()
            e.stopPropagation()
            e.stopImmediatePropagation()
        })

        // --- Hover handlers ---
        categoryItemEl.addEventListener('mouseenter', () => {
            // Clear any close timer for ANY submenu
            if (menuState.closeTimer) {
                clearTimeout(menuState.closeTimer)
                menuState.closeTimer = null
            }
            
            // Clear any OTHER open timers
            menuState.openTimers.forEach((timer, menu) => {
                if (menu !== submenuEl) {
                    clearTimeout(timer)
                    menuState.openTimers.delete(menu)
                }
            })
            
            // If this submenu is already visible, keep it open
            if (submenuEl.classList.contains('visible')) {
                return
            }
            
            // Always wait for delay before opening, even when switching
            const timer = setTimeout(() => {
                showThisSubmenu()
                menuState.openTimers.delete(submenuEl)
            }, 200)
            menuState.openTimers.set(submenuEl, timer)
        })
        
        categoryItemEl.addEventListener('mouseleave', () => {
            // Clear any open timer for this submenu
            if (menuState.openTimers.has(submenuEl)) {
                clearTimeout(menuState.openTimers.get(submenuEl))
                menuState.openTimers.delete(submenuEl)
            }
            
            // Start close timer only if this submenu is visible
            if (submenuEl.classList.contains('visible')) {
                menuState.closeTimer = setTimeout(hideThisSubmenu, 300)
            }
        })
        
        // Keep submenu open when hovering over it
        submenuEl.addEventListener('mouseenter', () => {
            // Clear any close timer
            if (menuState.closeTimer) {
                clearTimeout(menuState.closeTimer)
                menuState.closeTimer = null
            }
            // Ensure submenu stays visible
            if (!submenuEl.classList.contains('visible')) {
                showThisSubmenu()
            }
        })
        
        submenuEl.addEventListener('mouseleave', () => {
            menuState.closeTimer = setTimeout(hideThisSubmenu, 300)
        })

        // Don't append submenu as child - will be added to submenuContainer
        menuEl.appendChild(categoryItemEl)
        
        // Store reference to submenu on the category item
        categoryItemEl.submenuEl = submenuEl
    })

    // ========================================================================
    // 6. KEYBOARD NAVIGATION SETUP
    // ========================================================================
    menuState.keyboardNav = new KeyboardNavigationManager(
        menuEl, 
        submenuContainer, 
        (categoryElement) => {
            // Clear timers and show submenu directly
            clearAllTimers()
            
            // Call the stored showSubmenu function for this category
            const showFunction = menuState.categoryShowFunctions.get(categoryElement)
            if (showFunction) {
                showFunction()
            }
        },
        () => {
            // Hide current submenu
            if (menuState.currentOpenSubmenu) {
                menuState.currentOpenSubmenu.classList.remove('visible')
                if (menuState.currentOpenSubmenu.parentNode === submenuContainer) {
                    submenuContainer.removeChild(menuState.currentOpenSubmenu)
                }
                menuState.currentOpenSubmenu = null
            }
        },
        hideAllMenus
    )
    
    // Store reference for external access
    menuEl.keyboardNav = menuState.keyboardNav

    // ========================================================================
    // 7. FINAL SETUP
    // ========================================================================
    document.body.appendChild(menuEl)
    menuEl.style.display = 'none' // Explicitly set initial display state
    
    return menuEl
}

function showStartMenu(){
    hideAllMenus()
    startMenu.style.display = 'flex'
    const btn = document.getElementById('nodes-menu-btn')
    const btnRect = btn.getBoundingClientRect()

    // Position the menu above the button
    startMenu.style.left = `${btnRect.left}px`
    startMenu.style.bottom = `${window.innerHeight - btnRect.top}px`
    startMenu.style.top = 'auto' // unset top

    // Always create nodes at center position
    setCenterNodePosition()
    
    // Activate keyboard navigation
    if (startMenu.keyboardNav) {
        startMenu.keyboardNav.activate()
    }
}

// ============================================================================
// GLOBAL MENU MANAGEMENT
// ============================================================================
export function hideAllMenus(){
    // Clean up any visible tooltips
    const existingTooltips = document.querySelectorAll('.menu-tooltip')
    existingTooltips.forEach(tooltip => tooltip.remove())
    
    // Reset the ignore flag when menus are hidden
    ignoreNextMouseUp = false
    
    if(quickMenu){ quickMenu.style.display = 'none' }
    if(startMenu){ 
        startMenu.style.display = 'none' 
        
        // Deactivate keyboard navigation
        if (startMenu.keyboardNav) {
            startMenu.keyboardNav.deactivate()
        }
        
        // Close any open submenus immediately
        const visibleSubmenus = document.querySelectorAll('.menu-category-submenu.visible')
        visibleSubmenus.forEach(submenu => {
            submenu.classList.remove('visible')
        })
        // Clear submenu container
        const submenuContainer = document.querySelector('.submenu-container')
        if (submenuContainer) {
            submenuContainer.innerHTML = ''
        }
    }
}

export function createMenu(){
    editor = document.getElementById('editor')
    // Set initial X position now that editor is available
    const editorRect = editor.getBoundingClientRect()
    X = (editorRect.width / 2) - 100  // Center in editor
    quickMenu = createQuickMenu()
    startMenu = createStartMenu()

    const startMenuBtn = document.getElementById('nodes-menu-btn')
    
    // Trigger on mousedown for immediate response
    startMenuBtn.addEventListener('mousedown', (e) => {
        e.preventDefault()
        e.stopPropagation()
        // Check if menu is hidden (including empty string on first load)
        const isHidden = !startMenu.style.display || startMenu.style.display === 'none'
        if(isHidden){
            showStartMenu()
        } else {
            hideAllMenus()
        }
    })
    
    // Prevent click from doing anything
    startMenuBtn.addEventListener('click', (e) => {
        e.preventDefault()
        e.stopPropagation()
    })

    document.addEventListener('contextmenu', (e) => {
        if(e.target.closest('input') || e.target.closest('textarea')){return}
        if(!(e.ctrlKey || e.metaKey)){
            e.preventDefault()
            showQuickMenu(e)
        }
    })
    
    // Add keyboard handlers for menus
    document.addEventListener('keydown', (e) => {
        // Check for backtick/tilde key for quick menu
        if (e.key === '`' && !e.target.closest('input') && !e.target.closest('textarea')) {
            e.preventDefault()
            // Create a fake event with centered coordinates within editor
            const editorRect = editor.getBoundingClientRect()
            const centerEvent = {
                clientX: editorRect.left + (editorRect.width / 2),
                clientY: window.innerHeight / 2,
                preventDefault: () => {}
            }
            showQuickMenuCentered(centerEvent)
        }
        // Check for 'n' key to open start menu (like Windows key)
        else if (e.key === 'n' && !e.target.closest('input') && !e.target.closest('textarea')) {
            e.preventDefault()
            const isHidden = !startMenu.style.display || startMenu.style.display === 'none'
            if(isHidden){
                showStartMenu()
            } else {
                hideAllMenus()
            }
        }
    })

    // Close menus on click outside, but not if clicking on menu items
    document.addEventListener('click', (e) => {
        // Don't close if clicking on the menus themselves or any menu items
        if (!e.target.closest('#nodes-menu-start') && 
            !e.target.closest('#nodes-menu-quick') &&
            !e.target.closest('.menu-category-item') && 
            !e.target.closest('.menu-category-submenu') &&
            !e.target.closest('#nodes-menu-btn')) {
            hideAllMenus()
        }
    })
    
    // Close menus on escape
    document.addEventListener('escape-pressed', hideAllMenus)
}