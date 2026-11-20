# GRIDBOX Electrical Grid Simulator

GRIDBOX is an interactive electrical-grid sandbox for designing and operating 10 kV distribution networks and 100 kV transmission networks. Build a network on a generated world map, configure generation and demand, add battery storage, protect lines with realistic current limits, and run the system one second at a time.

The simulator models connected electrical islands independently. It balances generation, demand, battery dispatch, curtailment, unserved load, line current, voltage, and resistive losses. The aim is not only to make total generation match total demand, but to build a network that can move that power without overloading lines or substations.

## Quick Start

1. Stay in **Edit** mode while building the network.
2. Select a source, load, battery, flywheel, pole, tower, or substation from the left panel, then click the map to place it.
3. Select a 10 kV or 100 kV line type, click the first endpoint, and click the second endpoint.
4. Click each source and load to set its operating range and initial power.
5. Add flywheels (and batteries) where generation and demand may not match.
6. Check line current ratings and substation transformer ratings.
7. Press **Run** to start the one-second simulation.
8. Inspect the overview, lines, and nodes for losses, curtailment, unserved load, battery activity, or trips.
9. Press **Stop** to return to Edit mode and revise the grid.

## Edit And Run Modes

The current mode is always shown in the interface.

### Edit mode

Edit mode is used to construct and configure the grid. In this mode, nodes can be placed, moved, copied, deleted, renamed, and connected. Source and load ranges, variable profiles, battery attributes, and substation ratings can also be changed.

Changing a constant source or load by typing in its power box takes effect when **Enter** is pressed. This prevents an incomplete number from being simulated while it is still being typed.

### Run mode

Run mode advances simulated time in one-second steps. During a run:

- Constant source output and constant load demand can still be changed within their configured ranges.
- Variable sources and loads are controlled by the simulator.
- Lines can be selected, manually tripped, and reclosed, including as a group.
- Source and load ranges, names, battery capacity and max rate, substation ratings, and network geometry are locked. Battery dispatch stays editable.
- Batteries charge or discharge every second according to their most recently calculated dispatch.
- A full power-flow calculation is performed only when the electrical state changes, such as after a setpoint change, variable-profile update, line trip, line reclose, or battery limit event.

If dispatch is unchanged, GRIDBOX advances battery energy and flywheel frequency using the last calculated power flows. Spinning the symbols does not trigger an electrical solve.

## Map Controls

- **Select:** Choose the Select tool, then click an object to inspect or edit it.
- **Move an object:** Drag a selected node while in Edit mode.
- **Select several objects:** Hold **Shift** while clicking objects.
- **Move a group:** Drag one of the selected nodes to move all selected nodes together.
- **Pan:** Drag empty map space with the Select tool, or right-drag with any tool active.
- **Zoom:** Use the mouse wheel or the zoom controls. Maximum zoom is 400%.
- **Cancel placement:** Press **Escape** to cancel a pending line or placement tool and return to Select.
- **Delete:** Select an object and press **Delete** or **Backspace** while no text field is active.
- **Copy and paste:** Select a node, press **Ctrl+C** and **Ctrl+V** on Windows/Linux, or **Cmd+C** and **Cmd+V** on macOS.
- **Rotate:** Press **Q** in edit mode while placing or selecting a battery, hydroelectric source, or rectangular load.

At 400% zoom, one small grid square represents 10 m by 10 m. Nodes, lines, symbols, and their numbers shrink together with the terrain as you zoom out. Poles, the smallest flywheel (16,000 kg·m² inertia), and 5 m loads have a centered 3 m by 3 m selection area so you can pick the short lines between them. Other nodes have a 5 m selection radius.

Most labels are deliberately hidden from the map to keep large networks readable. Click an object to see its full information in the inspector. Poles and towers retain small identification numbers, substations show their two-character display name, and sources, loads, and batteries show their live operating value.

## Building The Network

### 10 kV distribution lines

Distribution lines are black and can connect poles, substations, sources, loads, and batteries. They cannot connect to transmission towers. Sources, loads, and batteries therefore connect directly only to the distribution network.

### 100 kV transmission lines

Transmission lines are red and can connect only substations and transmission towers. They are intended for moving large quantities of power over longer distances. Their higher voltage and lower resistance reduce current and losses for the same transferred power.

### Line construction choices

Both voltage levels offer the same four current ratings:

| Construction | Current limit |
| --- | ---: |
| 1 thin wire | 500 A |
| 2 thin wires | 1,000 A |
| 1 thick wire | 2,000 A |
| 2 thick wires | 4,000 A |

The line preview shows whether the selected construction uses one or two conductors and whether they are thin or thick. Double 100 kV conductors are spaced farther apart than double 10 kV conductors.

Only one line can connect a given pair of nodes. The line length is calculated from the endpoint positions in meters. Distribution resistance is 0.001 ohm per meter, while transmission resistance is 0.0001 ohm per meter.

### Poles

Poles are brown circular joints for 10 kV distribution lines. Conductors terminate cleanly at the edge of the pole. A small nearby number identifies each pole.

### Towers

Towers are small, square, light-gray X-truss joints for 100 kV lines. Conductors terminate at the square edge. A tower placed in water uses the water color behind its truss instead of a white land background. A small nearby number identifies each tower.

### Substations

Substations are purple hexagonal joints that connect the 10 kV and 100 kV systems. Each substation has:

- A full internal name shown in the inspector.
- An optional two-character **Display** name shown on the map.
- A transformer rating from 1 MW to 80 MW.
- Live stepped-power and utilization information after the grid is solved.

Substation size increases with transformer rating:

| Transformer rating | Approximate map size |
| --- | ---: |
| 1-10 MW | 10 x 10 m |
| Over 10-20 MW | 20 x 20 m |
| Over 20-50 MW | 30 x 30 m |
| Over 50-80 MW | 40 x 40 m |

A substation warning means the power being stepped between voltage levels exceeds its configured transformer rating.

## Sources

Every source has a user-defined operating range and an initial output. The range minimum may be 0 kW, and the range maximum cannot exceed the limit of the chosen source type. A constant source can be controlled manually within that range. A variable source is controlled by its runtime profile.

Wind, solar, and geothermal sources are always **Variable**. Pause with **Stop** to switch any other source between **Constant** and **Variable**, or adjust a variable source's variability index. The index controls setpoint variation; it is separate from the island's electrical frequency in Hz.

| Source type | Default profile | Default variability index | Maximum range value | Map symbol |
| --- | --- | ---: | ---: | --- |
| Wind | Variable | 6 | 30,000 kW | Light-yellow triangle |
| Solar | Variable | 4 | 40,000 kW | Yellow square |
| Coal | Constant | - | 50,000 kW | Brown circle |
| Geothermal | Variable | 2 | 60,000 kW | Yellow-green rounded square |
| Natural gas | Constant | - | 70,000 kW | Olive-gold circle |
| Nuclear | Constant | - | 80,000 kW | Yellow circle |
| Hydroelectric | Constant | - | 100,000 kW | Tan rectangle |

The maximum value of a source's configured range determines its physical symbol size. The current generated power is shown on the source itself.

Wind, solar, and geothermal plants produce their full configured range when placed in the matching resource zone. Outside the matching zone, their effective operating range is reduced to 50%. Hydroelectric sources must touch a river and can be rotated by pressing **Q**.

Coal and natural-gas sources add a pollution tint to nearby loads. A load is exempt only when its entire footprint lies exclusively in an industrial zone. Any residential or commercial overlap keeps the tint.

## Loads

Every load has an operating range and an initial demand. The minimum must be greater than 0 kW. The maximum allowed range depends on the load type:

| Load type | Maximum range value | Placement rule |
| --- | ---: | --- |
| General | 10,000 kW | Anywhere on land |
| Residential | 10,000 kW | Must touch a residential zone |
| Commercial | 20,000 kW | Must touch a commercial zone |
| Industrial | 30,000 kW | Must touch an industrial zone |

Load symbols grow with their configured maximum, and the current requested demand is shown on the load. Loads can be constant or variable. Constant demand is controlled manually within the configured range; variable demand is controlled by the runtime profile.

If an electrical island cannot supply all requested demand, GRIDBOX serves the available power proportionally across its loads and reports the remaining demand as unserved load.

## Variable Power Profiles

Variable sources and loads follow slow, roughly cyclical changes with random deviations. They are not given a completely new random value every second.

- Each update changes power by a weighted value from -10% to +10% of the configured range span.
- Values near 0% are more likely than extreme changes.
- Every change is rounded to the nearest kW.
- A higher frequency index updates more often and generally varies more rapidly.
- Variable loads share a slowly changing system-wide demand bias, while retaining individual cycles and randomness.
- Variable sources use independent cycles and randomness rather than the common load bias.

Typical update intervals are about 13 seconds for frequency 2, 11 seconds for frequency 4, and 9 seconds for frequency 6. A power-flow solve is requested only when an update actually changes a setpoint.

## Batteries

Batteries connect directly to 10 kV distribution lines. Each battery has:

- **Capacity:** 10 GJ to 1,000 GJ.
- **Current reserve:** Editable in Edit mode from empty to the configured capacity.
- **Battery max rate:** 1 MW to 40 MW for both charging and discharging.
- **Live power:** Shows whether the battery is charging or discharging.

Battery symbols are green rounded rectangles sized by energy capacity:

| Capacity | Approximate map size |
| --- | ---: |
| 10-50 GJ | 10 x 20 m |
| Over 50-150 GJ | 15 x 25 m |
| Over 150-350 GJ | 20 x 30 m |
| Over 350-650 GJ | 20 x 40 m |
| Over 650-1,000 GJ | 30 x 50 m |

The stored reserve is printed on the battery in GJ, rounded to the nearest whole number. The inspector shows more precise reserve and state-of-charge information.

Set **Dispatch (MW)** in the inspector. A new battery starts idle. Positive values discharge, negative values charge, and zero holds the reserve. Release the slider or press **Enter** in the numeric field to apply a command, even during a run. Shift-select batteries with matching capacity and max rate to apply the same command **per battery**: +2 MW on three batteries requests 6 MW total. Press **Q** in edit mode to turn a selected battery 90 degrees.

The dispatch slider has 100 intervals from maximum charge to maximum discharge, with zero at the center. For example, a 10 MW maximum gives 200 kW per step. Slider commands land on whole kW; use the number box for 1 kW precision.

Commanded and actual power can differ. An isolated battery exchanges nothing; empty batteries cannot discharge and full ones cannot charge. Network protection can also back off a command. Energy follows actual power:

`reserve change in GJ = -battery power in kW x elapsed seconds / 1,000,000`

Positive battery power means the battery is discharging into the grid. Negative battery power means it is charging from the grid. A negative line net at a charging battery is therefore expected: power is entering the node rather than leaving it.

When batteries cannot cover the full imbalance, the next response depends on whether their electrical island has a flywheel.

## Flywheels and Frequency

Choose **Flywheel**, select a rotor, place it at a grid intersection, and connect it with a **10 kV** line. A new wheel starts at 60 Hz. Connected wheels share one frequency: a generation surplus speeds them up, and a deficit slows them down. Larger wheels give you more time to correct an imbalance.

| Mass | Rotor radius | Inertia (kg m²) | Frequency change per second at 1 MW imbalance | Symbol diameter |
|---:|---:|---:|---:|---:|
| 8,000 kg | 2 m | 16,000 | 0.421 Hz | 5 m |
| 12,000 kg | 3 m | 54,000 | 0.125 Hz | 10 m |
| 16,000 kg | 4 m | 128,000 | 0.053 Hz | 15 m |
| 20,000 kg | 5 m | 250,000 | 0.027 Hz | 20 m |

The rates are for one wheel acting alone. Two identical wheels sharing the same imbalance drift half as fast. For example, one 12,000 kg wheel serving a 2 MW deficit falls about 0.25 Hz each second, plus the effect of line losses. Commanding roughly +2 MW from a battery arrests the fall; a little more will bring frequency back up. Reduce the command again near 60 Hz.

A newly placed wheel stays still until it joins an energized island. A load alone cannot spin it up: connect a producing source or command a charged battery to discharge first. After a wheel spins up, opening its last line isolates it electrically, but does not stop the rotor. Its inspector shows **coasting**: power exchange is zero, and frequency and rpm stay exactly where they were at disconnection. GRIDBOX does not model bearing or air losses. Exporting and importing preserves this state.

If a load remains connected after generation disconnects, the spinning wheel can supply it and slow down; this is different from coasting with no load. When islands join, their shared frequency is the inertia-weighted average: `(I₁ × f₁ + I₂ × f₂) / (I₁ + I₂)`, where each island's inertia is the sum of its spinning rotors' moments of inertia. A coasting wheel counts when it reconnects; a never-started wheel supplies no frequency reference. Coasting on its own does not contribute a reading to the active-grid chart.

The header shows frequency, or the frequency range when islands differ. Click a wheel for its own frequency, power exchange and mechanical speed. Its eight-pole rotor turns at 900 rpm at 60 Hz (15 rpm per Hz). The cross on the map deliberately exaggerates changes: it turns at 30 rpm at 59 Hz, 60 rpm at 60 Hz and 120 rpm at 61 Hz. Its outline blinks red outside 59.5–60.5 Hz.

At **61 Hz**, protection curtails sources proportionally to keep a surplus from accelerating the wheels further. At **59 Hz**, it sheds demand proportionally to arrest a decline. Affected sources and loads blink orange. High-frequency protection resets on recovery to 60.8 Hz; low-frequency protection resets at 59.2 Hz. You can adjust setpoints or trip and reclose lines throughout. Splitting an island lets the two sides drift independently; reconnecting them synchronizes their wheels.

**Reading the chart.** Each trace covers up to 60 simulated seconds for an active island with flywheels. The legend shows frequency in Hz and **RoCoF** (rate of change of frequency) in Hz/s. A negative RoCoF means the island is slowing. A flat trace at 59 or 61 Hz can mean protection is intervening, not that your requested dispatch is balanced. Pausing freezes the chart; starting a new world, importing, or editing in a way that resets the clock clears it.

**Responding to trouble.** For falling frequency, reduce charging, discharge storage, increase generation, or trip a nonessential load feeder. For rising frequency, reduce discharge, charge storage, or lower generation. At a protection limit, batteries pushing in the wrong direction are backed off first; any remaining adjustment is shared among sources or loads. Inspect the line current before reclosing a tripped feeder. A wheel's full exchange flows through its connections, in either direction: 6 MW on a single 10 kV feeder is about 600 A before losses and will trip a 500 A line. Reclosing without reducing the flow can trip it again on the next tick.

## Power-Flow Mechanics

### Electrical islands

GRIDBOX divides the active network into connected islands using only lines that are in service. Every island is balanced and solved separately. A source in one island cannot supply a load in another, even if both appear in the same map view.

### Dispatch order

For each island, the simulator compares requested source generation with requested load and estimated network losses:

1. Apply each battery's signed manual command within its rate, reserve, and remaining capacity.
2. Combine battery power with generation, demand, and estimated line losses.
3. Flywheels absorb any remaining surplus or supply the remaining deficit until frequency protection intervenes.
4. In an island without flywheels, there is no modeled inertial buffer: excess generation is curtailed or unmet demand is shed immediately. Constant and variable sources share curtailment proportionally.
5. The voltage and line-current solution is recalculated, including resistive losses.

The effective value shown as generated power may therefore be lower than a source's requested setpoint. Similarly, served load may be lower than requested demand during a shortage.

### Voltage, current, and losses

Sources establish the distribution system near its nominal 10 kV level. Substations transform between the 10 kV and 100 kV portions of the network. GRIDBOX uses an iterative constant-power nodal solution to calculate active node voltages and line currents.

Line loss is calculated from current and resistance using `I^2R`. The power entering a line at its sending end is therefore slightly greater than the power leaving at its receiving end. The difference between those endpoint values is the line loss, not a power-balance error.

Click a line to inspect:

- Length and resistance.
- Rated voltage and current limit.
- Present current and loading percentage.
- Direction of power transfer.
- Power entering or exiting at both endpoints.
- Real-power transfer and line loss.
- In-service or tripped state.

Canvas arrows are intentionally omitted. Direction is stated in the line inspector, and each connected-line entry at a node is labeled with `X kW in` or `X kW out`.

The **Line net (+out)** value at a node is positive when the attached lines carry net power away from the node and negative when they carry net power into it.

## Trips And Protection

A line trips automatically when its calculated current exceeds its construction rating. A tripped line carries no power and may split one network into several islands.

Lines can also be tripped manually from the inspector. Shift-select several lines of the same type to trip or reclose them together, including during a run.

Reclosing a line in Edit mode does not automatically solve the grid. The new state is evaluated after **Run** is pressed. During Run mode, a reclosed overloaded line may trip again at the next protected one-second update. This makes it possible to test a reclose without bypassing protection.

## Reading The Overview

The overview summarizes the active grid and should be checked after every important change. Depending on the state of the network, it reports:

- Requested and effective generation.
- Requested and served load.
- Curtailed generation and unserved demand.
- Total network losses.
- Battery charging or discharging power.
- Total stored battery reserve.
- Total battery maximum rate.
- Line trips, overloads, and substation warnings.
- Current Edit or Run mode and elapsed simulation time.

Totals describe the whole map, but a healthy overall total can hide a weak individual island. Inspect isolated components and local warnings when the totals appear balanced but loads remain unserved.

## Multi-Selection And Common Editing

Hold **Shift** while clicking to build a selection. Selected nodes can be moved together in Edit mode. When every selected item is compatible, the inspector exposes common attributes that can be changed as a group, including names and substation display names.

Multiple selected lines can be tripped or reclosed together. Mixed selections retain selection and movement behavior but do not expose attributes that have no safe common meaning.

## World And Zones

The background world is generated deterministically from 10 m cells. It contains continents, oceans, rivers, settlement zones, industrial areas, and renewable-resource regions.

- All zones are on land.
- Rivers begin at coastlines with wide mouths, meander inland, vary in width, and may branch, merge, end inland, or reach another body of water.
- River branches avoid crossing in an X shape.
- Residential, commercial, and industrial zones control placement of specialized loads.
- Wind, solar, and geothermal zones improve the yield of their matching sources.
- Industrial zones tend to be smaller and are more common around city outskirts and near water.

When a zone-dependent source or load tool is active, the placement overlay helps identify valid and advantageous locations.

## Saving And Loading Grids

Use **Export** to download the current electrical grid as a JSON file. The export contains the network geometry, component attributes, operating ranges, battery state, and other information needed to restore the design. It also stores a compact world descriptor containing the procedural seed, generator version, and compatibility signature. This descriptor is only a few dozen bytes; the generated terrain and zone cells are not stored in the file.

Use **Import** to load a previously exported grid. The world descriptor recreates the same oceans, rivers, residential areas, commercial areas, industrial areas, and renewable-resource zones. Legacy JSON exports from older GRIDBOX versions are normalized during import. If a legacy file has no world seed, GRIDBOX derives a repeatable seed from its grid data and asks for the grid to be exported again so the descriptor is permanently recorded. Export a fresh copy before making major experimental changes to a valuable grid.

## Building A Reliable Grid

- Use 100 kV transmission for long-distance or high-power routes, then step down through substations near demand.
- Keep distribution runs short where practical. Shorter lines have lower resistance and lower `I^2R` losses.
- Choose conductor ratings with operating headroom. A line that runs just below its limit can trip after a variable-load increase or network contingency.
- Rate substations for the power that must cross between voltage levels, not merely for the nearest source or load.
- Provide more than one route to important loads when continuity matters. A single trip can otherwise isolate an entire area.
- Give batteries enough rate for short-term power imbalance and enough capacity for sustained imbalance. These solve different problems.
- Leave upward and downward headroom in variable operating ranges so profiles can move naturally.
- Place wind, solar, and geothermal sources in their matching zones to avoid the 50% off-zone yield reduction.
- Check both line endpoints when tracing power. Their difference should match the line's resistive loss.
- Test contingencies by manually tripping important lines during a run, then inspect islands, currents, battery response, and unserved load.
- Export the grid before major redesigns or stress tests.

GRIDBOX rewards balanced generation, adequate storage, correctly rated equipment, short low-voltage runs, and resilient network topology. The most useful designs are not merely balanced at one moment; they remain stable as variable power changes and individual lines leave service.
