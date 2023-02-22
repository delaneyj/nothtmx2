# What
After [discussion](https://discord.gg/fUueVgzy) HTMX has a heap of legacy issues.  Most of them around lack of test coverage.  Typescript is static test coverage, so typescript.  Changing from the JSDoc to actual typescript has made previous warnings into actual errors.

# Why 
HTMX is great, and want to see it be extended while online paying for what you need.  Like it or not its a JS Framework so make it so PRs and extensions can't break everyone as easily.  Plus you get an actual build system with multiple targets at no extra cost with source mapping and declaration that match the code.

# Differences
1. Typescript to get actual static analysis in the code.  HTMX's function signatures have types, so stop doing inference dance.
2. Use prettier, less BS around format bike shedding
3. Vite
   1.  tests fast
   2.  live dev server with HMR 
   3.  builds production matrix
4. rule 7b, showing that things are better for devs if they have better tools, htmx export look mostly the same either way
   
# Build Status
120 Errors until compiling

# Issues seen so far
1. JSDocs are wrong
2. .d.ts are incorrect
3. config docs don't match codebase
4. `parentElt(el)` and `getDocument()` wrap for no reason
5. matches needed a type union
6. var everywhere instead of let & const
7. template literals instead of str concat
8. parseHTML fragment seems wrong
9. makeFragment is assuming no nulls is querySelector
10. processWebSocketInfo... has nodeData but never used
11. same with processSSEInfo
12. var currentPathForHistory = location.pathname+location.search; only on init?
13. saveToHistoryCache getItem is string || null
14. substr is deprecated
15. oobSwap.parentNode can be null
16. attributeHash has a IE fix tag but no explaination
17. cleanUpElement can we remove IE fix?
18. swapOuterHTML call on parent can be null 
19. swapDelete call on parent can be null
20. querySelectorExt has many fail states
21. same with find
22. same with findall
23. removeElement call possible null  and parent
24. removeClassFromElement null call
25. removeClassFromElement null call
26. toggleClassOnElement null call
27. takeClassForElement null call
28. closest null call
29. scanForwardQuery not all paths return
30. scanBackwardsQuery not all paths return
31. addEventListenerImpl null call
32. removeEventListenerImpl null call
33. updateScrollState scrolling on document
34. updateScrollState scrollIntoView on document
35. getValuesForElement is update, poorly named
36. issueAjaxRequest promptResponse is at wrong scope
37. findAttributeTargets not all paths
38. handleTrigger null call
39. selectAndSwap null parent call , id null
40. isLocalLink null call
42. handleAjaxResponse null call
44. handleAttributes has task as func, others its call: () => void
45. getInputValues null query calls
46. swapInnerHTML null call
47. maybeCloseWebSocketSource not all paths return
48. findTitle not all paths
49. maybeCloseSSESource not all paths
50. swapDelete params not used
51. swapBeforeBegin null parent
52. swapAfterBegin null parent
53. getExtensions parent null
54. loadHistoryFromServer null call
55. addRequestIndicatorClasses null call
56. init null call
57. insertNodesBefore null call
58. handleSwap signature makes no sense
59. evalScript null parent
60. processNode null call
61. processSSESwap null call
62. processWebSocketSend filteredParameters is a Record everywhere but here, why?
63. maybeCloseWebSocketSource not all paths
64. triggerEvent null call
65. currentPathForHistory is assigned to but never used
66. getPathFromResponse not all paths
67. querySelectorAllExt so many bad states if anything null
68. querySelectorAllExt why window selector? you use as element everywhere
69. boostElement null call
70. initButtonTracking target null call
71. processVerbs null call
72. addTriggerHandler why is evt called evt when its an element?