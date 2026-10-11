(function (cad) {
  'use strict';

  const { cross } = cad.math;
  const normalize = quaternion => {
    const length = Math.hypot(...quaternion);
    return quaternion.map(value => value / length);
  };

  function fromBasis({ right, up, depth }) {
    const m00 = right[0], m01 = up[0], m02 = depth[0];
    const m10 = right[1], m11 = up[1], m12 = depth[1];
    const m20 = right[2], m21 = up[2], m22 = depth[2];
    const trace = m00 + m11 + m22;
    let w, x, y, z;
    if (trace > 0) {
      const s = Math.sqrt(trace + 1) * 2;
      w = s / 4;
      x = (m21 - m12) / s;
      y = (m02 - m20) / s;
      z = (m10 - m01) / s;
    } else if (m00 > m11 && m00 > m22) {
      const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
      w = (m21 - m12) / s;
      x = s / 4;
      y = (m01 + m10) / s;
      z = (m02 + m20) / s;
    } else if (m11 > m22) {
      const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
      w = (m02 - m20) / s;
      x = (m01 + m10) / s;
      y = s / 4;
      z = (m12 + m21) / s;
    } else {
      const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
      w = (m10 - m01) / s;
      x = (m02 + m20) / s;
      y = (m12 + m21) / s;
      z = s / 4;
    }
    return normalize([w, x, y, z]);
  }

  function rotate(quaternion, vector) {
    const [w, x, y, z] = quaternion;
    const imaginary = [x, y, z];
    const twice = cross(imaginary, vector).map(value => value * 2);
    const second = cross(imaginary, twice);
    return vector.map((value, index) => value + w * twice[index] + second[index]);
  }

  function toBasis(quaternion) {
    return {
      right: rotate(quaternion, [1, 0, 0]),
      up: rotate(quaternion, [0, 1, 0]),
      depth: rotate(quaternion, [0, 0, 1]),
    };
  }

  function slerp(first, second, amount) {
    let target = second;
    let cosine = first.reduce((sum, value, index) => sum + value * second[index], 0);
    if (cosine < 0) {
      target = second.map(value => -value);
      cosine = -cosine;
    }
    if (cosine > .9995) return normalize(first.map((value, index) => value + (target[index] - value) * amount));
    const angle = Math.acos(Math.min(1, cosine));
    const sine = Math.sin(angle);
    const firstWeight = Math.sin((1 - amount) * angle) / sine;
    const secondWeight = Math.sin(amount * angle) / sine;
    return first.map((value, index) => value * firstWeight + target[index] * secondWeight);
  }

  cad.orientation = { fromBasis, toBasis, slerp };
})(window.WebCAD = window.WebCAD || {});
