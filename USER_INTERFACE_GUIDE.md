# AGIL Mesh Web UI User Guide

This guide explains how to use the AGIL Mesh Web UI, from login through monitoring, configuration, tools, and device information.

The Web UI is designed around five main areas:

- **Monitor**: live network topology, node list, SNR matrix, and node details.
- **Configuration**: RF, Network, Data, Audio, Security, GPS, and Global settings.
- **Tools**: Spectrum, Maptalks, Link Margin, and IPERF utilities.
- **Information**: device about page, license page, and update actions.
- **Alarm and Event Log**: persistent operational history, alarms, and export actions.

## 1. Accessing the Web UI

Open the device Web UI in a browser using the device IP address.

Example:

```text
http://192.168.10.33
```

The application uses the browser host as the device IP when available. 
## 2. Login Page

The login page contains:

- AGIL Mesh logo
- Mesh Console title
- Dark / Light theme selector
- Language selector
- Password field
- Login button
- Change Password button
- WebUI Version label

### Login

1. Enter the device password.
2. Click **Login**.
3. After successful login, the Web UI opens the **Monitor** page.

For development or offline testing, the application may allow the default password `admin` if the device login service cannot be reached.

### Change Password

1. Click **Change Password**.
2. Enter the current password.
3. Enter the new password.
4. Confirm the new password.
5. Submit the form.

If the password update succeeds, the page shows a success notice and asks the user to log in again.

### Theme Selection

Use **Dark** or **Light** to switch the UI theme before login. The same visual theme continues after login.

### Language Selection

Use the **Language** selector on the login page to switch the interface language.

Language support includes:

- **English**
- **Chinese**
- **Arabic**
- **Spanish**
- **Bahasa Indonesia**

The selected language is saved in the browser and continues after login. The language can also be changed later from the side navigation bar.

## 3. Main Layout After Login

After login, the UI is arranged into:

- **Side Navigation Bar** on the left
- **Top Status Bar** above the main content
- **Main Canvas** for the active page

On smaller screens, the layout adapts for mobile and tablet use.

## 4. First-Time Operator Quick Start

For a new operator, use this short path before exploring the full configuration and tools set:

1. Open **Monitor** to view the network topology and confirm all expected nodes are online.
2. If nodes are missing, open **Configuration > Network > Network Identity** and verify that the Mesh ID matches across all devices.
3. Once the network is connected, open **Tools > Maptalks** to verify the physical location of the nodes.
4. Open **Tools > Spectrum** to find the cleanest frequency.
5. Apply the selected frequency from **Configuration > RF > RF Basic**.

## 5. Side Navigation Bar

The side navigation bar provides access to the main UI functions.

Main navigation:

- **Monitor**: opens the network topology monitor.
- **Configuration**: opens device configuration settings.
- **Tools**: opens diagnostic and planning tools.
- **Information**: opens device about and license information.
- **Log**: opens alarm and event history.

Bottom controls:

- **Split View**: enables two work areas side by side.
- **Language**: switches the UI language.
- **Mode**: switches between dark and light theme.
- **Log Out**: exits the authenticated UI and returns to the login page.

### Collapse and Expand

Click the logo/header area of the side navigation bar to collapse or expand it.

When collapsed, the sidebar shows icons only. Click again to expose the labels.

## 6. Top Status Bar

The top status bar gives a quick view of the current device and mesh state.

Status indicators:

- **Online Nodes**: number of nodes currently online.
- **Eth 0**: Ethernet 0 status.
- **Eth 1**: Ethernet 1 status.
- **Update**: indicates whether configuration update status is active.

Status cards:

- **IP Address**
- **Node ID**
- **Mesh ID**
- **RF Mode**
- **Frequency**
- **Bandwidth**
- **Range**
- **Encryption**

Each status card is clickable. Clicking a card opens the related configuration page and section.

Examples:

- Click **IP Address** to open **Configuration > Network > Addressing**.
- Click **RF Mode** to open **Configuration > RF > RF Basic**.
- Click **Encryption** to open **Configuration > Security**.

When a status card opens a configuration page, the related field is highlighted with a thin glowing border and the page scrolls to that field. For example, clicking **Frequency** opens **RF Basic**, focuses the Frequency field, and briefly highlights it so the user can see exactly what the status card refers to.

## 7. Monitor Page

The Monitor page shows live network status and topology.

Main areas:

- **Nodes Online** selector
- **Network Topology** canvas
- **Topology / Matrix** view switch
- **Node Information** panel when a node is selected
- **Link Quality - SNR** legend

### Nodes Online Panel

The Nodes Online panel lists online nodes with:

- Node ID
- Node name
- IP address
- Resource usage
- Show checkbox

Use this panel to control which nodes are displayed on the topology canvas.

Actions:

- **All**: display all online nodes.
- **None**: hide all nodes from the topology.
- **Show checkbox**: display or hide one node.
- Search box: filter by node ID, name, or IP address.

### Network Topology View

The topology view displays nodes and directional SNR links.

Features:

- Node positions are arranged automatically.
- Link colors represent SNR quality.
- Link arrows show direction.
- Heterogeneous link groups are highlighted using colored node rings.
- A heterogeneous link legend explains the ring color used for each group.
- Node names are hidden by default and appear on hover.
- Clicking a node opens the Node Information card.

Topology controls:

- **Topology**: graph view.
- **Matrix**: SNR matrix table view.
- **Show / Hide Nodes**: toggles the Nodes Online panel.
- **Show / Hide Legend**: toggles the Link Quality legend.
- **Refresh**: reloads topology data.

### Link Quality SNR Colors

| Quality | SNR Range |
| --- | --- |
| Excellent | >= 27 dB |
| Good | 13-26 dB |
| Average | 8-12 dB |
| Fair | 3-7 dB |
| Poor | <= 2 dB |
| No link | <= -10 dB |

### Matrix View

Matrix view displays the SNR relationship in table form.

- Rows are source nodes.
- Columns are destination nodes.
- Table values are SNR in dB.
- Each cell uses the link-quality color relationship.
- Click a cell to view link detail, including TX node, RX node, SNR, link quality, and reverse SNR.

### Node Information Card

Click a node in topology view to display Node Information.

The card includes:

- **Identity**: Node ID, Node Name, IP Address, Resource Use
- **Telemetry**: Latitude, Longitude, Altitude, FPGA Temperature, Receive, Transmit
- **Heterogeneous Link**: related heterogeneous link group and nodes
- **Receiving Links**: source nodes, SNR, range, and quality

Close the card using the `x` button.

Node Information is positioned so it does not block the main topology control buttons. Use the close button after inspection. If the operator needs to compare information while changing views, the card can remain open while switching between Topology and Matrix.

## 8. Configuration Page

The Configuration page is used to read and update device settings.

The Configuration page uses a left-side configuration sidebar for the main categories:

- **RF**
- **Network**
- **Data**
- **Audio**
- **Security**
- **GPS**
- **Global**

Each category opens its own settings page on the right. Section navigation, such as **RF Basic / RF Advance / RF Expert** or **Network Identity / Addressing / DHCP Server**, is shown near the page heading.

The **Global** category is different from the other categories. It consolidates every setting marked with `*` into one page and displays all available global cards directly in the main canvas. This lets an operator review RF, Network, Audio, Security, and other update-all-node parameters in one place without moving through separate breadcrumb sections.

The **Import** and **Export** actions are located at the bottom of the left Configuration sidebar, separated by a subtle divider from the category links:

- **Import**: imports configuration values from a `.msconf` or JSON file.
- **Export**: exports eligible configuration values.

This placement moves them out of the primary workspace, preventing visual competition with the main **Apply Changes** button while keeping them accessible for bulk configuration tasks. These buttons are intentionally styled as quiet dark-grey outline actions.

Common controls:

- **Refresh**: reads current settings from the device.
- **Reset All**: resets draft values back to the latest loaded values.
- **Update All Nodes**: enables global configuration mode for supported `*` parameters.
- **Search**: jumps directly to matching tabs or settings, such as frequency, DHCP, encryption, GPS, or Ethernet.
- **Apply Changes**: posts all modified settings after the Review Changes confirmation.

### Configuration Search

Use the search box to quickly find configuration settings by name or category.

Examples:

- Type `frequency` to jump to RF frequency settings.
- Type `DHCP` to jump to Network DHCP Server settings.
- Type `encryption` to jump to Security settings.
- Type `GPS` to jump to positioning settings.

Selecting a search result opens the correct category and section, scrolls the field into view, and highlights the related setting.

### Visual Draft State

When a field value is changed but has not yet been applied, the field enters a draft state.

Draft indicators:

- The changed input, dropdown, slider, or manager field shows a bright amber/yellow border.
- A small **Draft** label appears beside the field name.
- The **Apply Changes** button in the bottom-right corner increments its count, for example **Apply Changes (2)**.
- A compact unsaved-changes summary appears near the Apply button so the operator can see which areas have pending edits before opening the review modal.

The number in **Apply Changes (n)** is the number of unsaved modified parameters for the active configuration category.

Use **Reset All** to discard draft values and restore the latest loaded device values. Navigating away from the Configuration page or refreshing the browser clears draft changes that have not been applied.

Fields marked with `*` are global configuration parameters. When **Update All Nodes** is enabled, changes to these parameters are intended to apply across online nodes that support the global update behavior.

Use **Configuration > Global** when several global parameters need to be reviewed or modified together. The original `*` settings still remain in their normal RF, Network, Audio, Security, or GPS locations, but the Global page duplicates them into a single consolidated view for faster bulk review.

### Field Hints and Tooltips

Some settings include a small circular `?` hint icon beside the label. Hover over the icon, or focus it with the keyboard, to see the helper text.

Example:

- **Dual RF Mode ?** shows: "Show TX Frequency when enabled."

This keeps the card compact while preserving the explanation for settings that need context.

### Review Changes Before Apply

When **Apply Changes** is clicked, the Web UI opens a **Review Changes** modal before posting the configuration.

The modal shows:

- Section being changed
- Old value
- New value
- Whether **Update All Nodes** is enabled
- Human-readable setting names that will be posted

Use this review step carefully for IP address, RF frequency, bandwidth, encryption, and global update changes. After a successful post, the UI shows an **Apply successful** notification with the exact setting names that were sent.

Internal API labels are hidden from the operator-facing Review Changes list. The dialog is intended to confirm meaning and values, not expose endpoint details.

### RF Configuration

RF has three sections:

- **RF Basic**
- **RF Advance**
- **RF Expert**

RF Basic includes:

- RF Mode
- Frequency
- Bandwidth
- Range
- Dual RF Mode
- Dual Bandwidth Mode
- TX Frequency
- TX Bandwidth

Bandwidth options depend on the device `chipLevel`.

RF Basic is arranged into two logical groups:

- **Core Parameters**: RF Mode, Frequency, Bandwidth, and Range.
- **Dual Settings**: Dual RF Mode, Dual Bandwidth Mode, TX Frequency, and TX Bandwidth.

RF Advance includes:

- RSSI Control
- STDMA
- Adaptive Range Mode
- Burst Aggregation Mode
- Interference Resistance Mode
- Power Output
- Transmission Mode

RF Expert includes:

- Silence
- Awake Nodes
- Restricted Frequencies
- SNR Threshold
- Minimum Modulation Format
- Custom Modulation
- Disconnect Nodes
- RF Switch

Some RF options appear only when the required license is available.

### Network Configuration

Network sections:

- **Network Identity**
- **Addressing**
- **DHCP Server**
- **Network Optimization**
- **SNMP**
- **Routing And Priority**
- **Network Interfaces**
- **Broadcast Filtering**
- **Multicast Filtering**

Network Identity includes Mesh ID, Node Name, and Node ID.

Addressing includes IP Address, Netmask, and Gateway.

DHCP Server includes DHCP server, DHCP forward, address pool, gateway, and DNS.

Network Optimization includes compression, heterogeneous network, DSCP behavior, Ethernet disable mode, maximum resources ratio, and **OCL**. Some parameters appear only on supported firmware versions.

**OCL** is used to define telemetry and control chains in the network.

- Open **Network Optimization > OCL > Manage** to edit OCL chains.
- Add node IDs as a comma-separated ordered chain, for example `33, 31, 32`.
- Each chain is stored as an array of node IDs.
- Multiple chains are stored as an array of arrays, for example `[[33,31,32],[12,14]]`.
- The node order must remain the configured link order.
- **OCL** is marked with `*`, so it is eligible for **Update All Nodes** when global configuration mode is enabled.

Routing and filtering sections use **Manage** dialogs for list-based parameters.

### Data Configuration

Data contains serial interface sections:

- **RS232**
- **TTL**
- **RS485**

Each serial interface includes:

- Mode
- Baudrate
- Parity bits
- Frame interval
- IP destination
- Port
- Port B

### Audio Configuration

Audio includes:

- Cross Network Audio
- Audio Mode
- Audio Codec
- Audio Mic Gain
- Audio Headset Gain
- Audio Detection Threshold
- Audio PTT Talk Group
- Audio PTT Listen Group

Mic gain, headset gain, and detection threshold use bar/slider controls.

### Security Configuration

Security includes:

- Encryption Mode
- Password / Encryption Key

Supported modes include:

- Disable
- AES256
- AES128
- DES

AES options may depend on license status. DES does not require the AES license.

### GPS Configuration

GPS includes:

- Position Module Mode
- Preset Latitude
- Preset Longitude
- Preset Altitude

Use preset coordinates when the device needs fixed fallback location data.

### Global Configuration

Global contains all configuration parameters marked with `*`.

Unlike RF, Network, Data, Audio, Security, and GPS, the Global page does not use breadcrumb section switching. All global cards are displayed together in the main canvas so the operator can scan and edit supported update-all-node parameters from a single view.

Global may include settings from:

- RF Basic
- RF Advance
- RF Expert
- Network Identity
- Network Optimization
- Multicast Filtering
- Audio
- Security

Use this page when preparing changes that may apply across online nodes. Before confirming, always review the **Review Changes** modal and verify that **Update All Nodes** is enabled only when the change should be sent with `configGlobal=true`.

## 9. Tools Page

The Tools page provides diagnostics, planning, and mapping functions.

Tools tabs:

- **Spectrum**
- **Maptalks**
- **Link Margin**
- **IPERF**

### Spectrum

Spectrum displays RSSI information by frequency.

It shows:

- Frequency samples
- Online nodes
- AI Assistant recommendation
- RSSI graph
- Node checkboxes
- RSSI view options such as Average, Antenna 1, and Antenna 2

The graph uses:

- X-axis: frequency in MHz
- Y-axis: RSSI level in dBm

Hover over a frequency point to view:

- Frequency point
- Average Noise RSSI
- Burst Interference RSSI
- Burst %

The AI Assistant recommends a frequency based on lower average noise, lower burst interference, and lower burst percentage.

### Maptalks

Maptalks displays nodes on an interactive map.

Features:

- Roadmap, terrain, satellite, hybrid, and offline image layers
- Zoom controls
- Refresh
- View All
- Recenter
- Open external map
- Upload Offline
- Download Offline
- Save View
- Load Saved
- Show / Hide SNR links
- Coverage Overlay with user-defined radius and opacity

Node behavior:

- Nodes are placed using latitude and longitude.
- Click a node to open the Node Information card.
- Node Information shows Node ID, Node Name, IP Address, Latitude, Longitude, and Altitude.
- The side panel lists mapped nodes by Node ID and Node Name.
- Hover popups are intentionally disabled on the map to keep the canvas clean.

Nodes Online side panel:

- Shows mapped node count, Node ID, and Node Name.
- Includes a compact **Range Summary** when at least two nodes have valid coordinates.
- The Range Summary shows the nearest node pair and the average distance across mapped nodes.
- If no valid coordinates are available, the panel shows an empty-state message instead of a large assistant card.

Coverage overlay:

- Enable **Coverage Overlay** to draw a coverage radius around each mapped node.
- Set the radius in kilometers using the Radius field.
- Adjust overlay visibility using the Opacity slider.
- Overlapping coverage areas appear stronger, helping users identify shared coverage regions.

SNR links:

- The map can display colored SNR link lines between mapped nodes.
- Use **Show SNR** or **Hide SNR** to control visibility.
- Numeric SNR badges are hidden for a cleaner map view.

Offline map:

- **Upload Offline** imports an image or `.agilmap` package.
- **Download Offline** exports the current offline package.
- **Save View** saves the current view in the browser.
- **Load Saved** restores the saved browser view.

### Link Margin

Link Margin is a planning calculator for link distance and margin.

Environment presets:

- Rural
- Suburban
- Urban
- Maritime

The calculator estimates practical link range using:

- Frequency
- Target distance
- Antenna height
- Tx power
- Antenna gain
- Cable loss
- Rx sensitivity
- Fade margin
- Diversity gain

Click an environment result card to update the visual link display.

The AI Assistant summarizes whether the selected environment covers the desired target distance and highlights surplus or deficit margin.

### IPERF

IPERF provides UDP throughput testing using the device browser API.

The IPERF page is arranged as one test console:

- **Client Configuration** on the left for the sending node.
- **Server Configuration** on the right for the receiving node.
- **Advanced command drawer** for command-line and API URL details.
- **Live Results** area in the lower half of the card.

Typical workflow:

1. Enter the Server Node IP and Client Node IP.
2. Click **Run Server** to start IPERF on the receiving node.
3. Click **Run Client** to start the UDP test from the sending node.
4. Refresh server or client results using the relevant session ID.
5. Review the unified **Live Results** area.

Client fields include:

- Client Node IP
- Server Node IP
- UDP Port
- Bandwidth
- Session ID

Server fields include:

- Server Node IP
- Interval
- Duration
- Session ID

Use **Show Command** to expand advanced details, including the generated client command, server command, execution URLs, and result URLs.

When no result is available, the Live Results area displays a simple placeholder. When results are available, it shows:

- Average UDP throughput
- Samples
- Jitter
- Loss
- Datagrams
- Server result text
- Client result text

The AI Assistant summary appears inside the Live Results area after result data is available.

Server and client result panes are retained in the browser after leaving and returning to the IPERF tab. Use **Clear Results** to remove the saved IPERF results.

## 10. Information Page

The Information page has two tabs:

- **About**
- **License**

### About

About displays:

- ESN
- Product Code
- Maximum RF Output
- Frequency Range
- WebUI Version
- Firmware Version

Actions:

- **Firmware Update**
- **WebUI Update**

#### Firmware Update

Firmware packages must use the `.tar.gz` file format.

1. Click **Firmware Update** and select the firmware package.
2. Review the package name and confirm the warning. Do not power off, restart, or shut down the radio during the update.
3. The Web UI uploads the package to `http://<device-ip>:8080/upload` as multipart form data using the form field `file`.
4. After the upload service returns `OK`, the Web UI sends `GET http://<device-ip>/update` to start the upgrade.
5. The upgrade request may take up to three minutes. `OK` indicates that the upgrade was accepted; `FAILED` indicates that it was unsuccessful.
6. After a successful update, the device reboots automatically. Wait for it to return online, then use **Refresh** to verify the reported Firmware Version.

If the browser closes, the network disconnects, or the request times out after the upgrade has started, do not immediately repeat the upgrade. The device continues the upgrade independently of the browser. Wait for the device to reboot and verify its current version. Re-upload the package only when the reported version confirms that the upgrade failed.

Because the upload service uses port `8080`, it is a different browser origin from the normal Web UI. The device upload service must allow requests from the Web UI origin. A browser message such as **Failed to fetch** may indicate that port `8080` is unavailable or that its CORS policy does not allow the request.

#### WebUI Update

WebUI packages use the `.zip` file format and follow a separate flow from firmware:

1. Click **WebUI Update** and select the WebUI package.
2. Confirm the selected package.
3. The Web UI posts the package to `http://<device-ip>/webupload` as multipart form data using the form field `webfile`.
4. Wait for the upload result. The firmware `/update` request is not used for a WebUI package.

The browser creates the multipart `Content-Type` header and boundary automatically. Do not manually change this header. Text or HTML response content is accepted; the response body determines whether the operation succeeded.

### License

License displays license information and supports:

- **License Update**

Use this tab to verify enabled device capabilities that affect RF and Security option visibility.

## 11. Alarm and Event Log

The Alarm and Event Log records operational events so the user can review what happened over time.

Tracked events include:

- Node joining the network
- Node offline
- Weak SNR
- High temperature above 85 C
- Invalid GPS
- Configuration update pending
- Ethernet down
- Alarm cleared
- Polling errors
- Repeated event groups, for example **Error polling alarm x 12**

Severity levels:

- **Info**: normal operational event.
- **Warning**: condition needs attention.
- **Critical**: urgent condition that may affect operation.

Actions:

- **Refresh**: polls device status again.
- **Clear Logs**: clears stored log entries from the browser.
- **Export CSV**: downloads log entries as a CSV file.
- **Export JSON**: downloads log entries as a JSON file.

Logs are retained in browser storage so they do not disappear when the user leaves and returns to the Log page. Duplicate events are filtered to keep the history readable.

Repeated noisy events are grouped into a single row with a count. For example, repeated alarm polling failures appear as one **Error polling alarm x 12** entry instead of twelve separate rows. This keeps the table readable while still preserving event frequency.

## 12. Split View

Split View lets the user display two work areas at the same time.

Example:

- Monitor on the left
- Configuration or Tools on the right

How to use:

1. Click **Split View** in the side navigation bar.
2. Select the secondary page from the split view selector.
3. Work with both panels in the same main canvas.

Split View is useful when comparing live topology behavior while changing configuration or running tools.

## 13. Theme and Responsive Behavior

The UI supports:

- Dark mode
- Light mode
- Multiple languages
- Desktop layout
- Tablet layout
- Mobile layout

Use **Mode** in the side navigation bar to switch theme after login.

On smaller screens:

- Navigation becomes more compact.
- Cards reduce in size.
- Tabs scroll horizontally when needed.
- Topology and map controls reflow to avoid overlap.

Language behavior:

- English, Chinese, Arabic, Spanish, and Bahasa Indonesia are available from the language selector.
- Arabic uses right-to-left layout where appropriate.
- Technical values, endpoint-derived values, IP addresses, node IDs, and units remain readable in their original format.
- Some device-returned option values may remain in English when they are firmware-defined values.

Configuration layout behavior:

- **Desktop / Tablet**: configuration cards can use a two-column layout. For example, RF Basic places Core Parameters on the left and Dual Settings on the right to use the available screen width efficiently.
- **Global**: all global cards are shown together in a responsive card grid. On wider screens, multiple cards can appear side by side in the main canvas.
- **Mobile**: configuration cards collapse into a single vertical column. Field labels are placed directly above their input fields so values remain readable on narrow screens.

## 14. Common User Workflows

### Check Current Network Health

1. Login.
2. Open **Monitor**.
3. Review Nodes Online.
4. Check topology link colors.
5. Click a node for Node Information.
6. Switch to Matrix view for detailed SNR relationships.

### Change Device IP Address

1. Click the **IP Address** status card.
2. Confirm it opens **Configuration > Network > Addressing**.
3. Confirm the IP Address field is highlighted.
4. Edit IP Address, Netmask, or Gateway.
5. Click **Apply Changes**.
6. Review old value to new value in the **Review Changes** modal.
7. Confirm apply.
8. Reconnect using the new IP if required.

### Change RF Frequency From the Status Card

1. Click the **Frequency** status card.
2. Confirm it opens **Configuration > RF > RF Basic**.
3. Confirm the Frequency field is highlighted.
4. Click **Manage** beside Frequency if the frequency list needs editing.
5. Select the desired frequency.
6. Click **Apply Changes**.
7. Confirm the old and new frequency in **Review Changes**.

### Change RF Frequency From Configuration

1. Open **Configuration > RF > RF Basic**.
2. Review RF Mode and Frequency.
3. Click **Manage** beside Frequency if the frequency list needs editing.
4. Select the desired frequency.
5. Click **Apply Changes**.
6. Review old value to new value in the **Review Changes** modal.
7. Confirm apply.

### Review Global Update Parameters

1. Open **Configuration > Global**.
2. Review all visible `*` parameter cards in the main canvas.
3. Enable **Update All Nodes** only if the modified settings should apply using `configGlobal=true`.
4. Edit the required global parameters.
5. Click **Apply Changes**.
6. Confirm the old value to new value list in the **Review Changes** modal.
7. Verify the success notification lists the exact parameter names posted.

### Review Spectrum Before Choosing Frequency

1. Open **Tools > Spectrum**.
2. Click **Refresh**.
3. Select the nodes to include.
4. Review the AI Assistant recommendation.
5. Hover graph points for detailed RSSI and burst information.
6. Use the recommended frequency in RF Basic configuration.

### View Nodes on Map

1. Open **Tools > Maptalks**.
2. Click **View All**.
3. Toggle **Show SNR** if link lines are needed.
4. Click a node to view Node Information.
5. Use **Upload Offline** or **Download Offline** for offline map handling.

### Run UDP Throughput Test

1. Open **Tools > IPERF**.
2. Select **Server** and start the server on the receiving node.
3. Select **Client** and enter sending/receiving node IPs.
4. Run the client test.
5. Refresh results.
6. Review AI Assistant throughput summary.
7. Use **Clear Results** only when the saved result panes are no longer needed.

### Review Alarms and Export Events

1. Open **Log** from the side navigation bar.
2. Review severity, event type, node, and detail.
3. Use filters if needed.
4. Export as CSV or JSON for reporting.
5. Click **Clear Logs** only when the stored event history is no longer needed.

## 15. Notes for Operators

- Always confirm the device IP in the browser address bar before applying configuration.
- Some options are hidden if the device license or firmware version does not support them.
- Fields marked with `*` are intended for global update behavior when Update All Nodes is enabled.
- Use **Configuration > Global** to review all `*` parameters together without opening each individual configuration category.
- Use **Apply Changes** as the single save point after editing configuration values.
- Use **Import** and **Export** from the Configuration sidebar for file-level actions.
- Configuration changes may require reconnecting if network addressing is changed.
- Use Matrix view when exact SNR values are required.
- Use Maptalks for geographic awareness and topology for radio link relationship analysis.
