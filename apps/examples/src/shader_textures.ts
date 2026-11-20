import { BoxMesh, Camera3D, Color, DirectionalLight3D, MeshInstance3D, SceneTree, Shader, ShaderMaterial, Texture2D, Vector3 } from "@corbel/core";
import { boot, status } from "./common.js";

// ShaderMaterial textures: `set_shader_parameter` answers both the vec4
// uniforms and a Texture2D on a name the Shader lists in texture_uniforms.
// The body reads it as `texture_<Name>`, sampled at the uv transform.

function shader_with_decal(): ShaderMaterial {
  const shader = Shader.lit({
    uniforms: ["Tint"],
    texture_uniforms: ["Decal"],
    webgpu_body: `  return vec4f(albedo * color * (lighting(normal, in.world) * Tint.rgb + texture_Decal.rgb), 1.0);`,
    webgl_body: `  return vec4(albedo * color * (lighting() * Tint.rgb + texture_Decal.rgb), 1.0);`,
  });
  return new ShaderMaterial(shader);
}

function green_decal(): Promise<Texture2D> {
  const canvas = document.createElement("canvas");
  canvas.width = 8;
  canvas.height = 8;
  const context = canvas.getContext("2d")!;
  const image = context.createImageData(8, 8);
  for (let i = 0; i < 64; i += 1) {
    image.data[i * 4] = 90;
    image.data[i * 4 + 1] = 230;
    image.data[i * 4 + 2] = 60;
    image.data[i * 4 + 3] = 255;
  }
  context.putImageData(image, 0, 0);
  return Texture2D.from_base64(canvas.toDataURL());
}

const tree = new SceneTree();
const camera_node = new Camera3D();
camera_node.set_name("Camera");
camera_node.position = new Vector3(0, 2.2, 6.4);
camera_node.rotation = new Vector3(-0.26, 0, 0);
tree.get_root().add_child(camera_node);

const sun_node = new DirectionalLight3D();
sun_node.set_name("Sun");
sun_node.rotation = new Vector3(0.6, 0.3, 0);
sun_node.light_color = Color.html("#e8e8ff");
tree.get_root().add_child(sun_node);

const floor_node = new MeshInstance3D();
floor_node.set_name("Floor");
floor_node.mesh = new BoxMesh(new Vector3(9, 0.25, 9));
floor_node.position = new Vector3(0, -0.75, 0);
const material = shader_with_decal();
material.set_shader_parameter("Tint", Color.html("#8880a0"));
void (async () => {
  material.set_shader_parameter("Decal", await green_decal());
})();
floor_node.material_override = material;
tree.get_root().add_child(floor_node);

const cube_node = new MeshInstance3D();
cube_node.set_name("Cube");
cube_node.mesh = new BoxMesh(new Vector3(1.1, 1.1, 1.1));
cube_node.position = new Vector3(0, -0.15, 1.4);
cube_node.material_override = material;
tree.get_root().add_child(cube_node);

void boot(tree).then(() => status("running — a ShaderMaterial paints the floor from a bound Decal texture plus a Tint vec4: both ride set_shader_parameter."));
