# Keep My Place extension v0.2.0

## Install

1. Extract the complete ZIP to a permanent folder.
2. In Chrome, open chrome://extensions.
3. Turn on Developer mode.
4. Choose Load unpacked, then select the folder containing manifest.json.
5. Pin Keep My Place to the browser toolbar.

No npm installation, website, account, API key or backend is required.
The website is an optional landing page and practice simulator.
In the extension popup, choose **Popup** or **Side panel** under **Open
extension as**. The toolbar button uses the selected mode. Side panel requires
Chrome 114 or newer and can remain open alongside browser tabs. Its layout
resizes to the panel width; long tab titles are shortened with an ellipsis.

## Behavior

The extension stores tab titles, URLs, focus timings and action events in
Chrome local storage. It does not read page contents. Tabs appear after more
than 5 seconds of focus as soon as you switch away. You can also add tabs manually.
Return reactivates the selected tab; Finished closes it after 2 seconds;
Not a task hides it. Export test data downloads a JSON file locally.
Favicons can load from the original tab's favicon address.
Drag one tab card onto another to create a group, or drag a card onto an
existing group to add it. Group names can be changed in the group header;
each group is assigned a random color when it is created. **Ungroup** returns
its cards to the main list.

## Verification scope

The JavaScript syntax and package contents were checked. A live installed
extension session was not exercised during this repackaging.
