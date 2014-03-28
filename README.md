# BlueInk

BlueInk began in late 2005 from ideas gathered from previous projects,
problems, and paper sketches. Over the years it grew into a unique and powerful
CMS.

Using the
[current commercial Software-as-a-Service BlueInk CMS](http://demo.blueinkcms.com/)
as the conceptual prototype, BlueInk is being rewritten into an Open Source CMS
built on Apache CouchDB and Cloudant mostly as a
[CouchApp](http://docs.couchdb.org/en/latest/couchapp/).

## Friend Funding

[![Flattr this git repo](http://api.flattr.com/button/flattr-badge-large.png)](https://flattr.com/submit/auto?user_id=BigBlueHat&url=http://github.com/BigBlueHat/BlueInk&title=BlueInk CMS - over the top Content Management with CouchDB&language=en_GB&tags=github&category=software)
[![Gittip](http://img.shields.io/gittip/BigBlueHat.svg)](https://www.gittip.com/BigBlueHat/)

### Page Demos
* [Home](http://bigbluehat.couchone.com:5984/blueink/_design/blueink/_list/page/page_and_items?include_docs=true&startkey=[%22home%22]&endkey=[%22home%22,{},{}])
* [About Us](http://bigbluehat.couchone.com:5984/blueink/_design/blueink/_list/page/page_and_items?include_docs=true&startkey=[%22about%22]&endkey=[%22about%22,{},{}])
* [About Us -=- People](http://bigbluehat.couchone.com:5984/blueink/_design/blueink/_list/page/page_and_items?include_docs=true&startkey=[%22about%22,%22people%22]&endkey=[%22about%22,%22people%22,{},{}])
* [Blog](http://bigbluehat.couchone.com:5984/blueink/_design/blueink/_list/page/page_and_items?include_docs=true&startkey=[%22blog%22]&endkey=[%22blog%22,{},{}])

#### Past Version Notes

0.4
---
* added blog rendering
* fixed rewrites.js to be compatible with CouchDB 1.1+ rewriter "bug": [COUCHDB-1306](https://issues.apache.org/jira/browse/COUCHDB-1306)

0.3.1
-----
* added page.site.host to handle site base URLs

0.3
---
* subnavigation now works with _rewrite
* avoiding _doc_ mutation in page_and_items/map.js

0.2.5
-----
* fixed template loading system

0.2.2
-----
* navigation can load partial sitemaps
* page now uses new sitemap format

0.2.1
-----
* upgraded couchapp

0.2
---
* restructured mustache templates to us a single page.html (vs. header, body, footer)
* added 'site' and 'sitemap' documents for general site info and pages tree/sitemap
* implemented navigation content item based on sitemap structure - include bits of the sitemap as content items

0.1.2
-----
* fixed template loading bug--was caused by when page template was overriding the default template
* reduce view size by leaning on include_docs rather than outputting whole doc in map/reduce

0.1.1
-----
* moved some files around in the _docs folder to make the easier HTML editing
* changed content items to use UUID's which is closer to what the production environment will be like

0.1
---

This initial release is meerly a proof of concept that shows the core BlueInk concepts could be easily
ported on to CouchDB.

BlueInk is unique in that it separates content from pages, not just occasionally, but fundamentally. This
means that every page is an aggregate of one or more content items. In our SQL-based version it took several
queries to put the page together. On CouchDB (even at this early, un-refactored stage), we've gotten page
creation down to a single GET request complete with CouchDB's fabulous HTTP headers for super-good caching!

All told, we're very excited about what's next for BlueInk. We look forward to getting the rest of it onto
the Couch soon.

## License

BlueInk on CouchDB is release under the [Apache License 2.0](http://www.apache.org/licenses/LICENSE-2.0)

[![I Love Open Source](http://www.iloveopensource.io/images/logo-lightbg.png)](http://www.iloveopensource.io/projects/5334dccb87659fce660018d8)
