from app.models.user import User


class MasterAdmin(User):
    """Master administrator role — Single Table Inheritance on `users`.

    This role carries unrestricted access to all CRUD operations.
    It CANNOT be assigned via the API; the `role` column must be set
    directly in the database to ``'master_admin'``.
    """

    __mapper_args__ = {
        "polymorphic_identity": "master_admin",
    }
