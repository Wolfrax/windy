from PIL import Image
import numpy as np
import matplotlib.pyplot as plt


class Field:
    def __init__(self, field_sz=200):
        # Initialize a rectangular field with 4 sub-fields with random values mapped to colormap "jet"
        self.cmap = plt.cm.get_cmap("jet")
        self.field = np.zeros((field_sz, field_sz))  # 2D rectangular zero field with 4 components (RGBA)
        self.intp_field = np.zeros((field_sz, field_sz))  # 2D rectangular zero field with 4 components (RGBA)
        self.size = self.field.shape[0]

        self.z = np.full((2, 2), np.random.rand(2,2))  # 2x2 random values

        x_sub_size = np.random.randint(0, self.size)
        y_sub_size = np.random.randint(0, self.size)

        self.field[0:x_sub_size, 0:y_sub_size] = self.z[0, 0]
        self.field[x_sub_size:self.size, 0:y_sub_size] = self.z[1, 0]
        self.field[0:x_sub_size, y_sub_size:self.size] = self.z[0, 1]
        self.field[x_sub_size:self.size, y_sub_size:self.size] = self.z[1, 1]

    def interpolate(self):
        x_vec = np.arange(0, self.size)
        y_vec = np.arange(0, self.size)

        x1 = x_vec[0]
        y1 = y_vec[0]

        x2 = x_vec[-1]
        y2 = y_vec[-1]

        t0 = 1.0 / ((x2-x1)*(y2-y1))

        for x in x_vec:
            for y in y_vec:
                t1 = self.z[0, 0] * (x2 - x) * (y2 - y)
                t2 = self.z[1, 0] * (x - x1) * (y2 - y)
                t3 = self.z[0, 1] * (x2 - x) * (y - y1)
                t4 = self.z[1, 1] * (x - x1) * (y - y1)
                self.intp_field[x, y] = t0 * (t1 + t2 + t3 + t4)

    def interpolate_polfit(self):
        x_vec = np.arange(0, self.size)
        y_vec = np.arange(0, self.size)

        x1 = x_vec[0]
        y1 = y_vec[0]

        x2 = x_vec[-1]
        y2 = y_vec[-1]

        t0 = 1.0 / ((x2-x1)*(y2-y1))
        t1 = np.array([[x2*y2, -x2*y1, -x1*y2, x1*y1],
                       [-y2, y1, y2, -y1],
                       [-x2, x2, x1, -x1],
                       [1, -1, -1, 1]])
        t2 = np.array([self.z[0,0], self.z[0, 1], self.z[1,0], self.z[1, 1]])
        a = t0 * (t1 @ t2)

        for x in x_vec:
            for y in y_vec:
                self.intp_field[x, y] = a[0] + a[1]*x + a[2]*y + a[3]*x*y

    def interpolate_matrix_form(self):
        x_vec = np.arange(0, self.size)
        y_vec = np.arange(0, self.size)

        x1 = x_vec[0]
        y1 = y_vec[0]

        x2 = x_vec[-1]
        y2 = y_vec[-1]

        t0 = 1.0 / ((x2-x1)*(y2-y1))
        t1 = np.array([self.z[0,0], self.z[0, 1], self.z[1,0], self.z[1, 1]])
        t2 = np.array([[x2*y2, -y2, -x2, 1],
                       [-x2*y1, y1, x2, -1],
                       [-x1*y2, y2, x1, -1],
                       [x1*y1, -y1, -x1, 1]])
        t3 = t0 * (t1 @ t2)
        for x in x_vec:
            for y in y_vec:
                self.intp_field[x, y] = t3 @ np.array([1, x, y , x*y])

    def image(self, use_intp_field=True):
        # Convert to image using colormap "jet"
        fld = self.intp_field if use_intp_field else self.field
        arr = np.zeros((self.size, self.size), dtype=(np.uint8, 4))
        for x in range(self.size):
            for y in range(self.size):
                arr[x, y] = self.cmap(fld[x, y], bytes=True)
        return Image.fromarray(arr)


if __name__ == "__main__":
    f = Field()
    f.image(use_intp_field=False).show()
    f.interpolate()
    f.image().show()

#    f.interpolate_polfit()
#    f.image().show()

#    f.interpolate_matrix_form()
#    f.image().show()


