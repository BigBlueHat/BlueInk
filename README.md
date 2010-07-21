BlueInk CMS
===========

BigBlueHat began building BlueInk CMS in late 2005 from ideas gathered from previous projects, problems,
and paper sketches. Over the years it's grown into a unique and powerful CMS.

Using the current commercial Software-as-a-Service BlueInk as the conceptual prototype, we're rewriting
BlueInk into an Open Source (Apache 2.0 Licensed) CMS built on CouchDB.

0.1
---

This initial release is mearly a proof of concept that shows the core BlueInk concepts could be easily
ported on to CouchDB.

BlueInk is unique in that it separates content from pages, not just occasionally, but fundamentally. This
means that every page is an aggregate of one or more content items. In our SQL-based version it took several
queries to put the page together. On CouchDB (even at this early, un-refactored stage), we've gotten page
creation down to a single GET request complete with CouchDB's fabulous HTTP headers for super-good caching!

All told, we're very excited about what's next for BlueInk. We look forward to getting the rest of it onto
the Couch soon.

### Page Demos
* [Home](http://bigbluehat.couchone.com:5984/blueink/_design/blueink/_list/page/page_and_items?include_docs=true&startkey=[%22home%22]&endkey=[%22home%22,{},{}])
* [About Us](http://bigbluehat.couchone.com:5984/blueink/_design/blueink/_list/page/page_and_items?include_docs=true&startkey=[%22about%22]&endkey=[%22about%22,{},{}])