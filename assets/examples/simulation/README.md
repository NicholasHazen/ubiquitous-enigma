# Fieldbook desktop experiments

These scripts never connect to hardware. Run them from this folder with Python 3.12 and the pinned package in requirements.txt. The HTML edition provides platform-specific setup commands.

1. Run `joint_probe.py` to create baseline.csv and baseline.svg.
2. Run `joint_probe.py --ramp 0.30 --out slow` to compare a slower command.
3. Run `search_ramp.py` to search 25 candidates, evaluate two reserved masses, and write results.

The verified-run folder preserves actual headless results from Python 3.12.14 and MuJoCo 3.3.7 on Linux, generated 23 October 2026. It is reference output; scripts write fresh results in their current working directory. Windows/macOS instructions were not executed in the authoring environment.

Checked: 1,000 physics steps span 2 seconds; final angle approaches 0.4 rad; sampled position remains inside joint bounds; a 0.30-second ramp reduces peak angular speed while increasing RMS error; the selected ramp improves the declared cost on both reserved masses; removing the speed penalty makes the step command win; invalid ramp/mass arguments raise ValueError.

The model is an instructional vertical hinge with finite actuator output. It has no floor contact, crawler locomotion, SG92R system identification, or physical transfer validation. Search optimizes command rise time, not actuator hardware or a locomotion policy.

Dependencies in the executed environment:

- mujoco 3.3.7
- numpy 2.5.4
- absl-py 2.5.1
- etils 1.14.0
- glfw 2.11.0
- PyOpenGL 3.1.10
- fsspec 2026.9.0
- typing_extensions 4.16.0
- zipp 4.1.2
