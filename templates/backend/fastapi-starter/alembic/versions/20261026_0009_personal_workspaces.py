"""Keep existing organizations as teams and add isolated personal workspaces."""
from alembic import op
import sqlalchemy as sa

revision = "20261026_0009"
down_revision = "20261026_0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("organizations") as batch:
        batch.add_column(sa.Column("personal_owner_user_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key("fk_organizations_personal_owner", "users", ["personal_owner_user_id"], ["id"], ondelete="CASCADE")
        batch.create_unique_constraint("uq_organizations_personal_owner", ["personal_owner_user_id"])


def downgrade() -> None:
    with op.batch_alter_table("organizations") as batch:
        batch.drop_constraint("uq_organizations_personal_owner", type_="unique")
        batch.drop_constraint("fk_organizations_personal_owner", type_="foreignkey")
        batch.drop_column("personal_owner_user_id")
