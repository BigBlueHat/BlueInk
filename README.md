# BlueInk

BlueInk began in late 2005 from ideas gathered from previous projects,
problems, and paper sketches. Over the years it grew into a unique and powerful
CMS.

Using the
[current commercial Software-as-a-Service BlueInk CMS](http://demo.blueinkcms.com/)
as the conceptual prototype, BlueInk is being rewritten into an Open Source CMS
built on Apache CouchDB and Cloudant mostly as a
[CouchApp](http://docs.couchdb.org/en/latest/couchapp/).

## Development

It's a bit rough in here still...but improving!

1. copy `config.json.sample` to `config.json`
2. update it with your settings
3. copy `config_ui.json.sample` to `config_ui.json`
4. update it with your settings
5. `npm install`
6. `npm run prosemirror` to build & install ProseMirror
7. `npm run semantic` to install Semantic-UI for rework to rework
8. `gulp rework` to "namespace" Semantic-UI under `.blueink-ui`
9. `gulp`
10. visit the URL you stored in `config.json` sans login info plus
`/_design/blueink/_rewrite/`

That should load the `home` (see `home.json`) page.

The site contents (content, templates, schemas, the whole shootin' match)
lives in `_docs`. The BlueInk editing UI and CouchDB views live in
`_design/blueink`.

The `default` gulp task will run browserify and push the resulting contents of
the various Design Docs which make up BlueInk to the database you configured.

If you're working with CSS changes you'll need to re-run `gulp rework` as it is
not (by design) part of the default gulp task. Also `npm run semantic` can be
used in conjunction with a `package.json` tweak to update the underlying
Semantic-UI code. If you've made changes to `src/semantic/src/theme.config`,
you can use `npm run styles` to rebuild the CSS and then `gulp rework`.

Note: plans exist in my brain to restructure the top-level `gulpfile.js` and
leverage Semantic's gulp stuff directly. Patches welcome! :smiley_cat:

## Friend Funding

[![Flattr this git repo](http://api.flattr.com/button/flattr-badge-large.png)](https://flattr.com/submit/auto?user_id=BigBlueHat&url=http://github.com/BigBlueHat/BlueInk&title=BlueInk CMS - over the top Content Management with CouchDB&language=en_GB&tags=github&category=software)
[![Gittip](http://img.shields.io/gittip/BigBlueHat.svg)](https://www.gittip.com/BigBlueHat/)

### Page Demos
* [Home](http://bigbluehat.cloudant.com/blueink/_design/blueink/_rewrite/home)
* [About Us](http://bigbluehat.cloudant.com/blueink/_design/blueink/_rewrite/about)
* [About Us -=- People](http://bigbluehat.cloudant.com/blueink/_design/blueink/_rewrite/about/people)
* [Blog](http://bigbluehat.cloudant.com/blueink/_design/blueink/_rewrite/blog)

## License

BlueInk on CouchDB is release under the [Apache License 2.0](http://www.apache.org/licenses/LICENSE-2.0)

[![I Love Open Source](http://www.iloveopensource.io/images/logo-lightbg.png)](http://www.iloveopensource.io/projects/5334dccb87659fce660018d8)
